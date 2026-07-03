import * as Lark from '@larksuiteoapi/node-sdk';
import { categoryOf, type FeishuCheck } from '@fitness/shared';
import { env } from '../env.js';
import { getOrCreateUserByOpenId, getSetting, insertCheckin, renameUser, setSetting, usersWithFeishu } from '../db.js';
import { computeStats } from '../stats.js';
import { todayStr } from '../dates.js';
import { parseCheckinMessage } from '../agent/deepseek.js';

const HELP_TEXT = [
  '我是健身打卡助手，直接把今天的运动发给我就行，比如：',
  '「打卡 晚上跑了5公里 35分钟」',
  '「攀岩1小时」——练什么都认得。',
  '休息日回「休息」可以保住连续记录。',
  '发「统计」查看当前数据。',
].join('\n');

let client: Lark.Client | null = null;
let wsClient: Lark.WSClient | null = null;
let running = false;

export interface FeishuCredentials {
  appId: string;
  appSecret: string;
}

/** 凭证来源：网页保存的（SQLite settings）优先，其次 .env */
export function feishuCredentials(): FeishuCredentials | null {
  const dbAppId = getSetting('feishu_app_id');
  const dbSecret = getSetting('feishu_app_secret');
  if (dbAppId && dbSecret) return { appId: dbAppId, appSecret: dbSecret };
  if (env.feishu.enabled) return { appId: env.feishu.appId, appSecret: env.feishu.appSecret };
  return null;
}

export function isFeishuRunning(): boolean {
  return running;
}

/** 用凭证换 tenant_access_token */
async function fetchTenantToken(creds: FeishuCredentials): Promise<{ token: string | null; error: string | null }> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }),
  });
  const body = (await res.json()) as { code: number; msg: string; tenant_access_token?: string };
  if (body.code !== 0) return { token: null, error: `飞书校验失败：${body.msg}（code ${body.code}）` };
  return { token: body.tenant_access_token ?? null, error: null };
}

/** 校验凭证，失败时返回错误信息 */
export async function verifyFeishuCredentials(creds: FeishuCredentials): Promise<string | null> {
  return (await fetchTenantToken(creds)).error;
}

/** 连接自检：凭证 → 机器人能力 → 长连接状态 → 已加入人数 */
export async function diagnoseFeishu(): Promise<FeishuCheck> {
  const result: FeishuCheck = {
    configured: false,
    credentialsValid: false,
    credentialsError: null,
    botName: null,
    botError: null,
    wsState: 'not_started',
    boundUsers: usersWithFeishu().length,
  };
  const creds = feishuCredentials();
  if (!creds) return result;
  result.configured = true;

  const { token, error } = await fetchTenantToken(creds);
  result.credentialsValid = token !== null;
  result.credentialsError = error;

  if (token) {
    try {
      const res = await fetch('https://open.feishu.cn/open-apis/bot/v3/info', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { code: number; msg: string; bot?: { app_name?: string } };
      if (body.code === 0 && body.bot?.app_name) {
        result.botName = body.bot.app_name;
      } else {
        result.botError = `拉取机器人信息失败：${body.msg}（code ${body.code}）——检查应用是否开启了「机器人」能力`;
      }
    } catch (err) {
      result.botError = String(err);
    }
  }

  result.wsState = wsClient ? wsClient.getConnectionStatus().state : 'not_started';
  return result;
}

/** 网页提交凭证：校验 → 存库 → 重连长连接（首次配置和更换凭证都走这里） */
export async function saveFeishuCredentials(creds: FeishuCredentials): Promise<string | null> {
  const error = await verifyFeishuCredentials(creds);
  if (error) return error;
  setSetting('feishu_app_id', creds.appId);
  setSetting('feishu_app_secret', creds.appSecret);
  restartFeishu();
  return null;
}

/** 断开现有长连接并用当前凭证重连 */
export function restartFeishu(): void {
  if (wsClient) {
    try {
      wsClient.close({ force: true });
      console.log('[feishu] 旧长连接已断开');
    } catch (err) {
      console.error('[feishu] 断开旧连接失败（忽略，继续重连）:', err);
    }
    wsClient = null;
    client = null;
  }
  running = false;
  startFeishu();
}

/** 主动给某个飞书用户发消息（提醒、周报用） */
export async function sendTextToOpenId(openId: string, text: string): Promise<boolean> {
  if (!client) return false;
  await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text }) },
  });
  return true;
}

/** 尽力从飞书拉真实姓名（需要通讯录权限；没有就返回 null，用兜底名） */
async function fetchFeishuName(openId: string): Promise<string | null> {
  try {
    const res = await client!.contact.user.get({
      path: { user_id: openId },
      params: { user_id_type: 'open_id' },
    });
    return res.data?.user?.name ?? null;
  } catch {
    return null;
  }
}

function statsSummary(userId: number): string {
  const s = computeStats(userId);
  const todayLine = s.today.checked
    ? `今天已打卡：${s.today.checkins.map((c) => c.activity + (c.durationMin ? ` ${c.durationMin}分钟` : '')).join('、')}`
    : '今天还没打卡';
  return [
    todayLine,
    `🔥 连续 ${s.streak} 天（历史最长 ${s.longestStreak} 天）`,
    `本周 ${s.week.days}/${s.week.goal} 次，本月 ${s.month.count} 次共 ${(s.month.totalMinutes / 60).toFixed(1)} 小时`,
  ].join('\n');
}

/** 提取文本消息内容，去掉 @机器人 的占位符 */
function extractText(message: { message_type: string; content: string }): string | null {
  if (message.message_type !== 'text') return null;
  try {
    const text = String(JSON.parse(message.content).text ?? '');
    return text.replace(/@_user_\d+/g, '').trim();
  } catch {
    return null;
  }
}

async function handleMessage(data: {
  sender: { sender_id?: { open_id?: string } };
  message: { message_id: string; message_type: string; content: string };
}): Promise<void> {
  const openId = data.sender.sender_id?.open_id;
  const text = extractText(data.message);
  if (!openId || !text) return;

  const reply = (t: string) =>
    client!.im.message.reply({
      path: { message_id: data.message.message_id },
      data: { msg_type: 'text', content: JSON.stringify({ text: t }) },
    });

  // 多用户：每个发消息的人自动建档；兜底名尽力换成飞书真实姓名
  const user = getOrCreateUserByOpenId(openId);
  if (user.name.startsWith('健友')) {
    const realName = await fetchFeishuName(openId);
    if (realName) {
      renameUser(user.id, realName);
      user.name = realName;
    }
  }

  if (/^(帮助|help|\?|？)$/i.test(text)) {
    await reply(HELP_TEXT);
    return;
  }
  if (/^(统计|查询|数据)$/.test(text)) {
    await reply(statsSummary(user.id));
    return;
  }

  const parsed = await parseCheckinMessage(text);
  if (!parsed.isCheckin) {
    await reply(`没看出来这是打卡记录 🤔\n\n${HELP_TEXT}`);
    return;
  }

  insertCheckin({
    userId: user.id,
    date: todayStr(),
    activity: parsed.activity,
    durationMin: parsed.durationMin,
    note: parsed.note,
    source: 'feishu',
    rawMessage: text,
  });

  const s = computeStats(user.id);
  if (categoryOf(parsed.activity) === 'rest') {
    await reply(`😌 已记录休息日，连续记录保住了（${s.streak} 天）。好好恢复！`);
    return;
  }
  const detail = [parsed.activity, parsed.durationMin ? `${parsed.durationMin} 分钟` : null, parsed.note]
    .filter(Boolean)
    .join(' · ');
  await reply(`✅ 已记录：${detail}\n🔥 连续打卡 ${s.streak} 天，本周 ${s.week.days}/${s.week.goal} 次，稳住！`);
}

/** 启动飞书长连接（参考 multica：WebSocket 事件订阅，无需公网回调）。未配置时静默跳过，可在网页保存凭证后再次调用热启动。 */
export function startFeishu(): void {
  const creds = feishuCredentials();
  if (!creds) {
    console.log('[feishu] 未配置凭证，跳过飞书接入（可稍后在网页「接入」卡片里填写）');
    return;
  }
  if (running) return;
  running = true;

  client = new Lark.Client({
    appId: creds.appId,
    appSecret: creds.appSecret,
    domain: Lark.Domain.Feishu,
  });

  wsClient = new Lark.WSClient({
    appId: creds.appId,
    appSecret: creds.appSecret,
    domain: Lark.Domain.Feishu,
    loggerLevel: Lark.LoggerLevel.info,
  });

  // 飞书可能重推事件，按 message_id 去重
  const seen = new Set<string>();
  const dispatcher = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      const id = data.message.message_id;
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 1000) {
        for (const k of seen) {
          seen.delete(k);
          if (seen.size <= 500) break;
        }
      }
      try {
        await handleMessage(data);
      } catch (err) {
        console.error('[feishu] 处理消息失败:', err);
      }
    },
  });

  wsClient.start({ eventDispatcher: dispatcher });
  console.log('[feishu] 长连接已启动，等待打卡消息');
}
