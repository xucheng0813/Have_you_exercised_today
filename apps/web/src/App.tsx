import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Checkin, Stats, User } from '@fitness/shared';
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
      aria-label="切换用户"
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

function Hero({ stats, onCheckin }: { stats: Stats; onCheckin: () => void }) {
  const today = todayStr();
  const checked = stats.today.checked;
  const first = stats.today.checkins[stats.today.checkins.length - 1];
  return (
    <div className="hero">
      <p className="h-kicker">{prettyDate(today)} 周{weekdayLabel(today)}</p>
      {checked ? (
        <>
          <h1>今天，<span className="blue">练了。</span></h1>
          <p className="h-sub">
            {stats.today.checkins
              .map((c) => `${c.activity}${c.durationMin ? ` ${c.durationMin} 分钟` : ''}${c.note ? ` · ${c.note}` : ''}`)
              .join('，')}
            {stats.streak > 1 ? ` · 连续第 ${stats.streak} 天` : ''}
          </p>
          {first && (
            <p className="h-caption">
              {first.source === 'feishu' ? '来自飞书 · 由 DeepSeek 自动解析' : '来自网页手动打卡'}
            </p>
          )}
        </>
      ) : (
        <>
          <h1>今天，还没练。</h1>
          <p className="h-sub">
            {stats.streak > 0 ? `连续 ${stats.streak} 天的记录，就差今天这一次。` : '从今天这一次开始。'}
          </p>
          <p className="h-caption">在飞书里发一句「打卡 跑步 30 分钟」，或者点下面的按钮。</p>
        </>
      )}
      <ActivityRings stats={stats} />
      <div className="h-ctas">
        <button className="btn-primary" onClick={onCheckin}>手动打卡</button>
        <a className="btn-secondary" href="#recent" style={{ textDecoration: 'none' }}>查看全部记录</a>
      </div>
    </div>
  );
}

function StatCards({ stats }: { stats: Stats }) {
  return (
    <div className="sect">
      <div className="sect-head"><h2>你的坚持，看得见。</h2></div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">连续打卡</div>
          <div className="value">{stats.streak}<small>天</small></div>
          <div className="sub">历史最长 {stats.longestStreak} 天</div>
        </div>
        <div className="stat-card">
          <div className="label">本周</div>
          <div className="value">{stats.week.days}<small>/ {stats.week.goal} 次</small></div>
          <div className="sub">目标每周 {stats.week.goal} 次</div>
        </div>
        <div className="stat-card">
          <div className="label">本月时长</div>
          <div className="value">{(stats.month.totalMinutes / 60).toFixed(1)}<small>小时</small></div>
          <div className="sub">{stats.month.count} 次运动</div>
        </div>
        <div className="stat-card">
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
    </div>
  );
}

function CoachTile({ userId }: { userId: number }) {
  const { data: report } = useQuery({
    queryKey: ['report', userId],
    queryFn: () => api.latestReport(userId),
  });
  return (
    <div className="coach">
      <p className="c-kicker">AI 教练 · DeepSeek · 每周一更新</p>
      {report ? (
        <>
          <h2>本周点评</h2>
          <p>{report.content}</p>
        </>
      ) : (
        <>
          <h2>教练还没开工。</h2>
          <p>配置 DEEPSEEK_API_KEY 后，每周一早上会根据你上周的打卡记录自动生成一份训练点评，同步推送到飞书。</p>
        </>
      )}
    </div>
  );
}

function RecentList({ checkins, userId }: { checkins: Checkin[]; userId: number }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: (id: number) => api.deleteCheckin(id, userId),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const recent = checkins.slice(0, 12);
  return (
    <div className="sect" id="recent">
      <div className="sect-head"><h2>最近记录</h2></div>
      <div className="recent-wrap">
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
    <>
      <nav className="gnav">
        <span className="g-logo">练 · 今天练了吗</span>
        <span className="g-right">
          {users && users.length > 0 && <UserPicker users={users} userId={userId} onChange={setUserId} />}
          <span className="g-date">{prettyDate(today)} 周{weekdayLabel(today)}</span>
        </span>
      </nav>
      {stats && <Hero stats={stats} onCheckin={() => setDialogOpen(true)} />}
      {stats && <StatCards stats={stats} />}
      <div className="sect parchment">
        <div className="panel-grid">
          <Heatmap checkins={checkins ?? []} />
          {stats && <WeekBars minutesByDay={stats.week.minutesByDay} />}
        </div>
      </div>
      <CoachTile userId={userId} />
      <RecentList checkins={checkins ?? []} userId={userId} />
      <ConnectSection />
      <footer className="app-footer">
        数据存储于本地 SQLite · 打卡消息由 DeepSeek 解析 · 每日 21:00 未打卡飞书提醒
      </footer>
      {dialogOpen && <CheckinDialog userId={userId} onClose={() => setDialogOpen(false)} />}
    </>
  );
}
