import { useMemo } from 'react';
import { categoryOf, type Checkin } from '@fitness/shared';
import { activityColor } from '../colors';
import { addDays, diffDays, mondayOf, todayStr } from '../dates';

const LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 每天柱子按当天时长最多的运动上色 */
function dominantColors(checkins: Checkin[]): (string | null)[] {
  const weekStart = mondayOf(todayStr());
  const weekEnd = addDays(weekStart, 6);
  const byDay = new Map<number, Map<string, number>>();
  for (const c of checkins) {
    if (c.date < weekStart || c.date > weekEnd || categoryOf(c.activity) === 'rest') continue;
    const idx = diffDays(c.date, weekStart);
    const m = byDay.get(idx) ?? new Map<string, number>();
    m.set(c.activity, (m.get(c.activity) ?? 0) + (c.durationMin ?? 30));
    byDay.set(idx, m);
  }
  return LABELS.map((_, i) => {
    const m = byDay.get(i);
    if (!m) return null;
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? activityColor(top[0]) : null;
  });
}

export function WeekBars({ minutesByDay, checkins }: { minutesByDay: number[]; checkins: Checkin[] }) {
  const max = Math.max(60, ...minutesByDay);
  const colors = useMemo(() => dominantColors(checkins), [checkins]);
  // 周一为 0；今天在本周的下标
  const dow = new Date().getDay();
  const todayIdx = dow === 0 ? 6 : dow - 1;

  return (
    <div className="panel">
      <p className="p-title">本周</p>
      <p className="p-hint">分钟 / 天 · 颜色 = 当天主要运动</p>
      <div className="bars">
        {minutesByDay.map((min, i) => (
          <div key={i} className={`bar-g${i === todayIdx ? ' today' : ''}`}>
            <div
              className="bar"
              style={{
                height: `${Math.max(7, (min / max) * 100)}%`,
                background: min > 0 ? (colors[i] ?? 'var(--blue)') : undefined,
              }}
              title={`${min} 分钟`}
            />
            <em>{LABELS[i]}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
