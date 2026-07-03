import type { Stats } from '@fitness/shared';

/** Apple Fitness 圆环配色 */
const RING_COLORS = { move: '#FA114F', exercise: '#92E82A', streak: '#1EEAEF' } as const;

const DAILY_GOAL_MIN = 30;
const STREAK_GOAL_DAYS = 7;

function Ring({ r, width, progress, color }: { r: number; width: number; progress: number; color: string }) {
  const c = 2 * Math.PI * r;
  const filled = Math.min(Math.max(progress, 0), 1) * c;
  return (
    <>
      <circle cx="100" cy="100" r={r} fill="none" stroke={color} strokeOpacity="0.18" strokeWidth={width} />
      {filled > 0 && (
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 100 100)"
        />
      )}
    </>
  );
}

export function ActivityRings({ stats }: { stats: Stats }) {
  const todayMinutes = stats.today.checkins.reduce((s, c) => s + (c.durationMin ?? 0), 0);
  const streakCapped = Math.min(stats.streak, STREAK_GOAL_DAYS);

  const rings = [
    {
      color: RING_COLORS.move,
      progress: todayMinutes / DAILY_GOAL_MIN,
      label: `今日 ${todayMinutes}/${DAILY_GOAL_MIN} 分钟`,
    },
    {
      color: RING_COLORS.exercise,
      progress: stats.week.days / stats.week.goal,
      label: `本周 ${stats.week.days}/${stats.week.goal} 次`,
    },
    {
      color: RING_COLORS.streak,
      progress: streakCapped / STREAK_GOAL_DAYS,
      label: `连击 ${streakCapped}/${STREAK_GOAL_DAYS} 天`,
    },
  ];

  return (
    <div className="rings">
      <svg viewBox="0 0 200 200" width="188" height="188" role="img"
        aria-label={rings.map((r) => r.label).join('，')}>
        <Ring r={84} width={17} progress={rings[0]!.progress} color={rings[0]!.color} />
        <Ring r={63} width={17} progress={rings[1]!.progress} color={rings[1]!.color} />
        <Ring r={42} width={17} progress={rings[2]!.progress} color={rings[2]!.color} />
      </svg>
      <div className="rings-legend">
        {rings.map((r) => (
          <span key={r.color}>
            <i style={{ background: r.color }} />
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
