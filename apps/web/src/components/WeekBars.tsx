const LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function WeekBars({ minutesByDay }: { minutesByDay: number[] }) {
  const max = Math.max(60, ...minutesByDay);
  // 周一为 0；今天在本周的下标
  const dow = new Date().getDay();
  const todayIdx = dow === 0 ? 6 : dow - 1;

  return (
    <div className="panel">
      <p className="p-title">本周</p>
      <p className="p-hint">分钟 / 天</p>
      <div className="bars">
        {minutesByDay.map((min, i) => (
          <div key={i} className={`bar-g${i === todayIdx ? ' today' : ''}`}>
            <div
              className={`bar${min > 0 ? ' on' : ''}`}
              style={{ height: `${Math.max(7, (min / max) * 100)}%` }}
              title={`${min} 分钟`}
            />
            <em>{LABELS[i]}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
