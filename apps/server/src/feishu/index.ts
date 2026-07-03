import * as Lark from '@larksuiteoapi/node-sdk';
import { categoryOf } from '@fitness/shared';
import { env } from '../env.js';
import { bindFeishuOpenId, getUserFeishuOpenId, insertCheckin } from '../db.js';
import { computeStats } from '../stats.js';
import { todayStr } from '../dates.js';
import { parseCheckinMessage } from '../agent/deepseek.js';

const HELP_TEXT = [
  '我是健身打卡助手，直接把今天的运动发给我就行，比如：',
  '「打卡 晚上跑了5公里 35分钟」',
  '「健身房练腿 1小时」',
  '休息日回「休息」可以保住连续记录。',
  '发「统计」查看当前数据。',
].join('\n');

let client: Lark.Client | null = null;

/** 主动给绑定用户发消息（提醒、周报用） */
export async function sendTextToUser(text: string): Promise<boolean> {
  const openId = getUserFeishuOpenId();
  if (!client || !openId) return false;
  await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text }) },
  });
  return true;
}

function statsSummary(): string {
  const s = computeStats();
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

  // 单用户应用：第一个私聊的人自动绑定，其他人礼貌拒绝
  const bound = getUserFeishuOpenId();
  if (!bound) {
    bindFeishuOpenId(openId);
    console.log(`[feishu] 已绑定用户 open_id=${openId}`);
  } else if (bound !== openId) {
    await reply('这是一个私人打卡机器人，已经绑定了主人啦。');
    return;
  }

  if (/^(帮助|help|\?|？)$/i.test(text)) {
    await reply(HELP_TEXT);
    return;
  }
  if (/^(统计|查询|数据)$/.test(text)) {
    await reply(statsSummary());
    return;
  }

  const parsed = await parseCheckinMessage(text);
  if (!parsed.isCheckin) {
    await reply(`没看出来这是打卡记录 🤔\n\n${HELP_TEXT}`);
    return;
  }

  insertCheckin({
    date: todayStr(),
    activity: parsed.activity,
    durationMin: parsed.durationMin,
    note: parsed.note,
    source: 'feishu',
    rawMessage: text,
  });

  const s = computeStats();
  if (categoryOf(parsed.activity) === 'rest') {
    await reply(`😌 已记录休息日，连续记录保住了（${s.streak} 天）。好好恢复！`);
    return;
  }
  const detail = [parsed.activity, parsed.durationMin ? `${parsed.durationMin} 分钟` : null, parsed.note]
    .filter(Boolean)
    .join(' · ');
  await reply(`✅ 已记录：${detail}\n🔥 连续打卡 ${s.streak} 天，本周 ${s.week.days}/${s.week.goal} 次，稳住！`);
}

/** 启动飞书长连接（参考 multica：WebSocket 事件订阅，无需公网回调）。未配置时静默跳过。 */
export function startFeishu(): void {
  if (!env.feishu.enabled) {
    console.log('[feishu] 未配置 FEISHU_APP_ID/SECRET，跳过飞书接入');
    return;
  }

  client = new Lark.Client({
    appId: env.feishu.appId,
    appSecret: env.feishu.appSecret,
    domain: Lark.Domain.Feishu,
  });

  const wsClient = new Lark.WSClient({
    appId: env.feishu.appId,
    appSecret: env.feishu.appSecret,
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
