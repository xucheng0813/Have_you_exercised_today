/** 运动类型 */
export const ACTIVITIES = ['跑步', '力量训练', '游泳', '骑行', '球类', '瑜伽', '徒步', '休息', '其他'] as const;
export type Activity = (typeof ACTIVITIES)[number];

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
    /** 本周有打卡的天数（周一起） */
    days: number;
    goal: number;
    /** 周一到周日，每天总分钟数 */
    minutesByDay: number[];
  };
  month: {
    /** 本月打卡次数 */
    count: number;
    totalMinutes: number;
  };
  /** 距最近一次力量训练的周数，null 表示从未 */
  weeksSinceStrength: number | null;
}

export interface WeeklyReport {
  id: number;
  /** 周一日期 YYYY-MM-DD */
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
