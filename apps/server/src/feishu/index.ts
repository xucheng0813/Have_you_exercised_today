import * as Lark from '@larksuiteoapi/node-sdk';
import { categoryOf } from '@fitness/shared';
import { env } from '../env.js';
import { getOrCreateUserByOpenId, getSetting, insertCheckin, renameUser, setSetting } from '../db.js';
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

/** 校验凭证（直接找飞书换 tenant_access_token），失败时返回错误信息 */
export async function verifyFeishuCredentials(creds: FeishuCredentials): Promise<string | null> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }),
  });
  const body = (await res.json()) as { code: number; msg: string };
  return body.code === 0 ? null : `飞书校验失败：${body.msg}（code ${body.code}）`;
}

/** 网页提交凭证：校验 → 存库 → 热启动长连接 */
export async function saveFeishuCredentials(creds: FeishuCredentials): Promise<string | null> {
  const error = await verifyFeishuCredentials(creds);
  if (error) return error;
  setSetting('feishu_app_id', creds.appId);
  setSetting('feishu_app_secret', creds.appSecret);
  startFeishu();
  return null;
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

  const wsClient = new Lark.WSClient({
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
