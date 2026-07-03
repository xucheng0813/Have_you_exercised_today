import type { Stats } from '@fitness/shared';
import { addDays, diffDays, mondayOf, todayStr } from './dates.js';
import { allCheckinDates, latestDateOfActivity, listCheckins } from './db.js';

const WEEK_GOAL = 5;

export function computeStats(): Stats {
  const today = todayStr();
  const dates = allCheckinDates();
  const dateSet = new Set(dates);

  // 连续打卡：今天没打则从昨天起算
  let streak = 0;
  let cursor = dateSet.has(today) ? today : addDays(today, -1);
  while (dateSet.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  // 历史最长
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev !== null && diffDays(d, prev) === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }

  // 本周（周一起）：休息日保连续，但不算运动天数/分钟
  const weekStart = mondayOf(today);
  const weekCheckins = listCheckins(weekStart, addDays(weekStart, 6)).filter((c) => c.activity !== '休息');
  const minutesByDay = [0, 0, 0, 0, 0, 0, 0];
  const weekDays = new Set<string>();
  for (const c of weekCheckins) {
    const idx = diffDays(c.date, weekStart);
    if (idx >= 0 && idx < 7) minutesByDay[idx]! += c.durationMin ?? 0;
    weekDays.add(c.date);
  }

  // 本月
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthCheckins = listCheckins(monthStart, today).filter((c) => c.activity !== '休息');
  const totalMinutes = monthCheckins.reduce((sum, c) => sum + (c.durationMin ?? 0), 0);

  const lastStrength = latestDateOfActivity('力量训练');
  const weeksSinceStrength = lastStrength === null ? null : Math.floor(diffDays(today, lastStrength) / 7);

  return {
    today: { checked: dateSet.has(today), checkins: listCheckins(today, today) },
    streak,
    longestStreak,
    week: { days: weekDays.size, goal: WEEK_GOAL, minutesByDay },
    month: { count: monthCheckins.length, totalMinutes },
    weeksSinceStrength,
  };
}
