import { useMemo } from 'react';
import type { Checkin } from '@fitness/shared';
import { addDays, mondayOf, todayStr } from '../dates';

const WEEKS = 18;

function levelOf(checkins: Checkin[]): number {
  if (checkins.length === 0) return 0;
  if (checkins.every((c) => c.activity === '休息')) return 1;
  const minutes = checkins.reduce((s, c) => s + (c.durationMin ?? 30), 0);
  if (minutes < 25) return 1;
  if (minutes < 45) return 2;
  if (minutes < 75) return 3;
  return 4;
}

export function Heatmap({ checkins }: { checkins: Checkin[] }) {
  const cells = useMemo(() => {
    const byDate = new Map<string, Checkin[]>();
    for (const c of checkins) {
      const list = byDate.get(c.date) ?? [];
      list.push(c);
      byDate.set(c.date, list);
    }
    const today = todayStr();
    const start = addDays(mondayOf(today), -(WEEKS - 1) * 7);
    const out: { date: string; level: number; future: boolean }[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const date = addDays(start, i);
      out.push({ date, level: levelOf(byDate.get(date) ?? []), future: date > today });
    }
    return out;
  }, [checkins]);

  return (
    <div className="panel">
      <p className="p-title">打卡热力图</p>
      <p className="p-hint">近 {WEEKS} 周</p>
      <div className="heatmap-scroll">
        <div className="heatmap" role="img" aria-label={`近${WEEKS}周每日打卡热力图`}>
          {cells.map((c) => (
            <div
              key={c.date}
              className={`hm${c.level > 0 ? ` l${c.level}` : ''}${c.future ? ' future' : ''}`}
              title={c.date}
            />
          ))}
        </div>
      </div>
      <div className="hm-legend">
        少 <span className="hm" /><span className="hm l1" /><span className="hm l2" /><span className="hm l3" /><span className="hm l4" /> 多
      </div>
    </div>
  );
}
