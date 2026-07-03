import OpenAI from 'openai';
import { ACTIVITIES, type Activity, type Checkin, type ParsedCheckin } from '@fitness/shared';
import { env } from '../env.js';

const client = env.deepseek.enabled
  ? new OpenAI({ apiKey: env.deepseek.apiKey, baseURL: 'https://api.deepseek.com' })
  : null;

const PARSE_SYSTEM_PROMPT = `你是健身打卡记录解析器。用户发来一条消息，判断是否为运动打卡，并解析成 JSON：
{
  "is_checkin": boolean,   // 是否在汇报一次运动（或明确说今天休息）
  "activity": string,      // 必须是以下之一：${ACTIVITIES.join('、')}
  "duration_min": number | null,  // 运动时长（分钟），说了小时要换算，没说则 null
  "note": string | null    // 距离、部位等补充信息，如「5 公里」「练腿」，没有则 null
}
注意：闲聊、提问、查询统计都不是打卡（is_checkin=false）。只输出 JSON。`;

/** DeepSeek 解析；未配置 key 或调用失败时降级为正则解析 */
export async function parseCheckinMessage(text: string): Promise<ParsedCheckin> {
  if (client) {
    try {
      const res = await client.chat.completions.create({
        model: env.deepseek.model,
        messages: [
          { role: 'system', content: PARSE_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });
      const raw = JSON.parse(res.choices[0]?.message.content ?? '{}');
      const activity = ACTIVITIES.includes(raw.activity) ? (raw.activity as Activity) : '其他';
      return {
        isCheckin: Boolean(raw.is_checkin),
        activity,
        durationMin: typeof raw.duration_min === 'number' ? Math.round(raw.duration_min) : null,
        note: typeof raw.note === 'string' && raw.note ? raw.note : null,
      };
    } catch (err) {
      console.error('[deepseek] 解析失败，降级正则:', err);
    }
  }
  return parseByRegex(text);
}

const ACTIVITY_KEYWORDS: [RegExp, Activity][] = [
  [/跑步|跑了|夜跑|晨跑|慢跑/, '跑步'],
  [/力量|撸铁|举铁|健身房|深蹲|卧推|硬拉|练(胸|背|腿|肩|臂|上肢|下肢)/, '力量训练'],
  [/游泳|游了|自由泳|蛙泳/, '游泳'],
  [/骑行|骑车|单车|动感单车/, '骑行'],
  [/羽毛球|篮球|足球|网球|乒乓|排球|壁球/, '球类'],
  [/瑜伽|普拉提|拉伸/, '瑜伽'],
  [/徒步|爬山|登山|hiking/i, '徒步'],
  [/休息|歇一天|不练/, '休息'],
];

export function parseByRegex(text: string): ParsedCheckin {
  let activity: Activity | null = null;
  for (const [re, act] of ACTIVITY_KEYWORDS) {
    if (re.test(text)) {
      activity = act;
      break;
    }
  }
  const isCheckin = activity !== null || /打卡|练了|运动了/.test(text);

  let durationMin: number | null = null;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:个)?(?:小时|h)/i);
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|min)/i);
  if (hourMatch) durationMin = Math.round(parseFloat(hourMatch[1]!) * 60);
  if (minMatch) durationMin = (durationMin ?? 0) + Math.round(parseFloat(minMatch[1]!));

  const kmMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:公里|km)/i);

  return {
    isCheckin,
    activity: activity ?? '其他',
    durationMin,
    note: kmMatch ? `${kmMatch[1]} 公里` : null,
  };
}

const REPORT_SYSTEM_PROMPT = `你是一位务实的健身教练。根据用户上周的打卡记录写一份简短的周报点评（150 字以内，中文）：
1. 先肯定做得好的地方（具体到某天某次训练）；
2. 指出结构性问题（如运动类型单一、力量训练缺席、连续中断）；
3. 给下周一条可执行的建议。
语气鼓励但不吹捧，不用列表，直接写成一段话。`;

/** 生成上周训练周报；未配置 DeepSeek 时返回 null */
export async function generateWeeklyReport(weekStart: string, checkins: Checkin[]): Promise<string | null> {
  if (!client) return null;
  const lines =
    checkins.length === 0
      ? '（上周没有任何打卡记录）'
      : checkins
          .map((c) => `${c.date} ${c.activity}${c.durationMin ? ` ${c.durationMin}分钟` : ''}${c.note ? `（${c.note}）` : ''}`)
          .join('\n');
  const res = await client.chat.completions.create({
    model: env.deepseek.model,
    messages: [
      { role: 'system', content: REPORT_SYSTEM_PROMPT },
      { role: 'user', content: `${weekStart} 起的一周打卡记录：\n${lines}` },
    ],
    temperature: 0.7,
  });
  return res.choices[0]?.message.content?.trim() ?? null;
}
