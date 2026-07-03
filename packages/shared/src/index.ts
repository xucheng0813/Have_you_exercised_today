/**
 * 运动名称是自由字符串（由 DeepSeek 从消息里识别，如「跑步」「攀岩」「跳绳」），
 * 不限定枚举；分类只用于统计（力量提醒、休息日）和前端配色。
 */
export type Activity = string;

/** 手动打卡时的常用建议（可自由输入其他名称） */
export const SUGGESTED_ACTIVITIES = ['跑步', '力量训练', '游泳', '骑行', '羽毛球', '瑜伽', '徒步', '跳绳', '休息'] as const;

export const REST_ACTIVITY = '休息';

export type ActivityCategory =
  | 'run'
  | 'strength'
  | 'swim'
  | 'ride'
  | 'ball'
  | 'yoga'
  | 'hike'
  | 'rest'
  | 'other';

const CATEGORY_RULES: [RegExp, ActivityCategory][] = [
  [/休息|歇/, 'rest'],
  [/跑|马拉松/, 'run'],
  [/力量|撸铁|举铁|健身房|深蹲|卧推|硬拉|杠铃|哑铃|器械|核心|练(胸|背|腿|肩|臂|上肢|下肢)/, 'strength'],
  [/游泳|游了|自由泳|蛙泳|潜水/, 'swim'],
  [/骑|单车|自行车|动感/, 'ride'],
  [/球|飞盘/, 'ball'],
  [/瑜伽|普拉提|拉伸|冥想/, 'yoga'],
  [/徒步|爬山|登山|散步|走路|hiking/i, 'hike'],
];

export function categoryOf(activity: Activity): ActivityCategory {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(activity)) return cat;
  }
  return 'other';
}

export type CheckinSource = 'feishu' | 'web';

export interface Checkin {
  id: number;
  userId: number;
  /** YYYY-MM-DD（本地时区） */
  date: string;
  activity: Activity;
  durationMin: number | null;
  note: string | null;
  source: CheckinSource;
  rawMessage: string | null;
  createdAt: string;
}

export interface NewCheckin {
  date?: string;
  activity: Activity;
  durationMin?: number | null;
  note?: string | null;
}

export interface Stats {
  today: {
    checked: boolean;
    checkins: Checkin[];
  };
  /** 连续打卡天数（截至今天；今天未打卡则截至昨天） */
  streak: number;
  longestStreak: number;
  week: {
    /** 本周有运动的天数（周一起，休息日不计） */
    days: number;
    goal: number;
    /** 周一到周日，每天总分钟数 */
    minutesByDay: number[];
  };
  month: {
    count: number;
    totalMinutes: number;
  };
  /** 距最近一次力量类训练的周数，null 表示从未 */
  weeksSinceStrength: number | null;
}

export interface WeeklyReport {
  id: number;
  weekStart: string;
  content: string;
  createdAt: string;
}

/** DeepSeek 解析飞书消息的结构化结果 */
export interface ParsedCheckin {
  isCheckin: boolean;
  activity: Activity;
  durationMin: number | null;
  note: string | null;
}

/** 接入状态（GET /api/setup） */
export interface SetupStatus {
  feishu: {
    configured: boolean;
    bound: boolean;
    appId: string | null;
  };
  deepseek: {
    configured: boolean;
    model: string;
  };
}
