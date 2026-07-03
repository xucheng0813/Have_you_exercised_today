import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUGGESTED_ACTIVITIES, type Checkin, type Stats, type User } from '@fitness/shared';
import { api } from './api';
import { addDays, prettyDate, todayStr, weekdayLabel } from './dates';
import { ActivityRings } from './components/ActivityRings';
import { Heatmap } from './components/Heatmap';
import { WeekBars } from './components/WeekBars';
import { CheckinDialog } from './components/CheckinDialog';
import { ConnectSection } from './components/ConnectSection';

const USER_KEY = 'fitness.userId';

function UserPicker({ users, userId, onChange }: { users: User[]; userId: number; onChange: (id: number) => void }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: api.createUser,
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onChange(user.id);
    },
  });
  return (
    <select
      className="user-select"
      value={userId}
      aria-label="切换成员"
      onChange={(e) => {
        if (e.target.value === '__new__') {
          const name = window.prompt('新成员名字：')?.trim();
          if (name) create.mutate(name);
        } else {
          onChange(Number(e.target.value));
        }
      }}
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
      <option value="__new__">＋ 添加成员</option>
    </select>
  );
}

/** 今日卡：圆环 + 状态 + 行内快速录入 */
function TodayCard({ stats, userId }: { stats: Stats; userId: number }) {
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState('');
  const [mins, setMins] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api.createCheckin({
        userId,
        activity: activity.trim(),
        durationMin: mins ? Number(mins) : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      setActivity('');
      setMins('');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (activity.trim()) add.mutate();
  };

  return (
    <div className="card today-card">
      <ActivityRings stats={stats} size={158} />
      <div className="today-info">
        <p className="card-kicker">今天 · {prettyDate(todayStr())} 周{weekdayLabel(todayStr())}</p>
        <h1 className="today-status">
          {stats.today.checked ? <>练了<span className="blue">。</span></> : '还没练。'}
        </h1>
        {stats.today.checkins.length > 0 ? (
          <ul className="today-list">
            {stats.today.checkins.map((c) => (
              <li key={c.id}>
                <b>{c.activity}</b>
                {c.durationMin ? ` ${c.durationMin} 分钟` : ''}
                {c.note ? ` · ${c.note}` : ''}
                <span className="today-src">{c.source === 'feishu' ? '飞书' : '网页'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-empty">
            {stats.streak > 0 ? `连续 ${stats.streak} 天的记录，就差今天这一次。` : '从今天这一次开始。'}
          </p>
        )}
        <form className="quick-add" onSubmit={submit}>
          <input
            list="activity-suggestions"
            value={activity}
            maxLength={16}
            placeholder="运动（跑步 / 攀岩…）"
            aria-label="运动"
            onChange={(e) => setActivity(e.target.value)}
          />
          <datalist id="activity-suggestions">
            {SUGGESTED_ACTIVITIES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <input
            type="number"
            min="1"
            max="1440"
            value={mins}
            placeholder="分钟"
            aria-label="时长（分钟）"
            onChange={(e) => setMins(e.target.value)}
          />
          <button type="submit" className="btn-primary sm" disabled={add.isPending || !activity.trim()}>
            {add.isPending ? '…' : '记录'}
          </button>
        </form>
        {add.isError && <p className="form-error">{(add.error as Error).message}</p>}
      </div>
    </div>
  );
}

function StatTiles({ stats }: { stats: Stats }) {
  return (
    <div className="stat-tiles">
      <div className="card stat-tile">
        <div className="label">连续打卡</div>
        <div className="value">{stats.streak}<small>天</small></div>
        <div className="sub">历史最长 {stats.longestStreak} 天</div>
      </div>
      <div className="card stat-tile">
        <div className="label">本周</div>
        <div className="value">{stats.week.days}<small>/ {stats.week.goal} 次</small></div>
        <div className="sub">目标每周 {stats.week.goal} 次</div>
      </div>
      <div className="card stat-tile">
        <div className="label">本月时长</div>
        <div className="value">{(stats.month.totalMinutes / 60).toFixed(1)}<small>小时</small></div>
        <div className="sub">{stats.month.count} 次运动</div>
      </div>
      <div className="card stat-tile">
        <div className="label">力量训练</div>
        {stats.weeksSinceStrength === null ? (
          <>
            <div className="value">—</div>
            <div className="sub">还没有记录</div>
          </>
        ) : (
          <>
            <div className="value">{stats.weeksSinceStrength}<small>周前</small></div>
            <div className="sub">{stats.weeksSinceStrength >= 2 ? '该安排一次了' : '节奏不错'}</div>
          </>
        )}
      </div>
    </div>
  );
}

function CoachCard({ userId }: { userId: number }) {
  const { data: report } = useQuery({
    queryKey: ['report', userId],
    queryFn: () => api.latestReport(userId),
  });
  return (
    <div className="card coach-card">
      <p className="card-kicker on-dark">AI 教练 · 每周一更新</p>
      {report ? (
        <p className="coach-text">{report.content}</p>
      ) : (
        <p className="coach-text muted">
          教练还没开工。配置 DEEPSEEK_API_KEY 后，每周一根据上周打卡自动生成训练点评，并推送到飞书。
        </p>
      )}
    </div>
  );
}

function RecentCard({ checkins, userId, onBackfill }: { checkins: Checkin[]; userId: number; onBackfill: () => void }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: (id: number) => api.deleteCheckin(id, userId),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const recent = checkins.slice(0, 10);
  return (
    <div className="card recent-card">
      <div className="card-head">
        <p className="card-title">最近记录</p>
        <button className="text-btn" onClick={onBackfill}>补卡</button>
      </div>
      {recent.length === 0 ? (
        <p className="recent-empty">还没有打卡记录。练一次，回来看看。</p>
      ) : (
        <ul className="recent">
          {recent.map((c) => (
            <li key={c.id}>
              <span className="r-date">{c.date.slice(5)} {weekdayLabel(c.date)}</span>
              <span className="r-type">{c.activity}</span>
              <span className="r-dur">
                {[c.durationMin ? `${c.durationMin} 分钟` : null, c.note].filter(Boolean).join(' · ')}
              </span>
              <span className="r-right">
                <span className="r-src">{c.source === 'feishu' ? '飞书' : '网页'}</span>
                <button className="r-del" title="删除这条记录" aria-label="删除这条记录"
                  onClick={() => window.confirm(`删除 ${c.date} 的${c.activity}记录？`) && del.mutate(c.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function App() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userId, setUserIdState] = useState(() => Number(localStorage.getItem(USER_KEY) ?? 1));
  const setUserId = (id: number) => {
    localStorage.setItem(USER_KEY, String(id));
    setUserIdState(id);
  };

  const today = todayStr();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: api.users });
  // 本地存的用户被删了（或换了数据库）时回退到第一个
  useEffect(() => {
    if (users && users.length > 0 && !users.some((u) => u.id === userId)) setUserId(users[0]!.id);
  }, [users, userId]);

  const { data: stats } = useQuery({
    queryKey: ['stats', userId],
    queryFn: () => api.stats(userId),
    refetchInterval: 60_000,
  });
  const { data: checkins } = useQuery({
    queryKey: ['checkins', userId],
    queryFn: () => api.checkins(userId, addDays(today, -18 * 7), today),
    refetchInterval: 60_000,
  });

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand"><span className="brand-mark">练</span>今天练了吗</span>
        <div className="top-right">
          <span className="top-date">{prettyDate(today)} 周{weekdayLabel(today)}</span>
          {users && users.length > 0 && <UserPicker users={users} userId={userId} onChange={setUserId} />}
        </div>
      </header>
      <main className="grid">
        <div className="g7">{stats && <TodayCard stats={stats} userId={userId} />}</div>
        <div className="g5">{stats && <StatTiles stats={stats} />}</div>
        <div className="g7"><Heatmap checkins={checkins ?? []} /></div>
        <div className="g5">{stats && <WeekBars minutesByDay={stats.week.minutesByDay} />}</div>
        <div className="g7"><RecentCard checkins={checkins ?? []} userId={userId} onBackfill={() => setDialogOpen(true)} /></div>
        <div className="g5 col">
          <CoachCard userId={userId} />
          <ConnectSection />
        </div>
      </main>
      <footer className="foot">数据存储于本地 SQLite · 打卡消息由 DeepSeek 解析 · 每日 21:00 未打卡飞书提醒</footer>
      {dialogOpen && <CheckinDialog userId={userId} onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
