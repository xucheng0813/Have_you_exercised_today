import Database from 'better-sqlite3';
import type { Activity, Checkin, CheckinSource, WeeklyReport } from '@fitness/shared';
import { env } from './env.js';

export const db = new Database(env.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feishu_open_id TEXT UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    duration_min INTEGER,
    note TEXT,
    source TEXT NOT NULL CHECK (source IN ('feishu', 'web')),
    raw_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, date);

  CREATE TABLE IF NOT EXISTS agent_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    week_start TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (user_id, week_start)
  );
`);

/** 单用户应用：保证 id=1 的默认用户存在 */
db.prepare(`INSERT OR IGNORE INTO users (id, name) VALUES (1, ?)`).run(env.userName);
export const DEFAULT_USER_ID = 1;

interface CheckinRow {
  id: number;
  user_id: number;
  date: string;
  activity: string;
  duration_min: number | null;
  note: string | null;
  source: string;
  raw_message: string | null;
  created_at: string;
}

function mapCheckin(r: CheckinRow): Checkin {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    activity: r.activity as Activity,
    durationMin: r.duration_min,
    note: r.note,
    source: r.source as CheckinSource,
    rawMessage: r.raw_message,
    createdAt: r.created_at,
  };
}

export function insertCheckin(input: {
  date: string;
  activity: Activity;
  durationMin?: number | null;
  note?: string | null;
  source: CheckinSource;
  rawMessage?: string | null;
}): Checkin {
  const info = db
    .prepare(
      `INSERT INTO checkins (user_id, date, activity, duration_min, note, source, raw_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      DEFAULT_USER_ID,
      input.date,
      input.activity,
      input.durationMin ?? null,
      input.note ?? null,
      input.source,
      input.rawMessage ?? null
    );
  return getCheckin(Number(info.lastInsertRowid))!;
}

export function getCheckin(id: number): Checkin | null {
  const row = db.prepare(`SELECT * FROM checkins WHERE id = ?`).get(id) as CheckinRow | undefined;
  return row ? mapCheckin(row) : null;
}

export function deleteCheckin(id: number): boolean {
  return db.prepare(`DELETE FROM checkins WHERE id = ? AND user_id = ?`).run(id, DEFAULT_USER_ID).changes > 0;
}

export function listCheckins(from: string, to: string): Checkin[] {
  const rows = db
    .prepare(
      `SELECT * FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date DESC, created_at DESC`
    )
    .all(DEFAULT_USER_ID, from, to) as CheckinRow[];
  return rows.map(mapCheckin);
}

/** 全部打卡日期（去重、升序），供 streak 计算 */
export function allCheckinDates(): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT date FROM checkins WHERE user_id = ? ORDER BY date ASC`)
    .all(DEFAULT_USER_ID) as { date: string }[];
  return rows.map((r) => r.date);
}

export function latestDateOfActivity(activity: Activity): string | null {
  const row = db
    .prepare(`SELECT MAX(date) AS d FROM checkins WHERE user_id = ? AND activity = ?`)
    .get(DEFAULT_USER_ID, activity) as { d: string | null };
  return row.d;
}

export function getUserFeishuOpenId(): string | null {
  const row = db.prepare(`SELECT feishu_open_id FROM users WHERE id = ?`).get(DEFAULT_USER_ID) as {
    feishu_open_id: string | null;
  };
  return row.feishu_open_id;
}

export function bindFeishuOpenId(openId: string): void {
  db.prepare(`UPDATE users SET feishu_open_id = ? WHERE id = ?`).run(openId, DEFAULT_USER_ID);
}

interface ReportRow {
  id: number;
  week_start: string;
  content: string;
  created_at: string;
}

export function saveReport(weekStart: string, content: string): void {
  db.prepare(
    `INSERT INTO agent_reports (user_id, week_start, content) VALUES (?, ?, ?)
     ON CONFLICT (user_id, week_start) DO UPDATE SET content = excluded.content, created_at = datetime('now', 'localtime')`
  ).run(DEFAULT_USER_ID, weekStart, content);
}

export function latestReport(): WeeklyReport | null {
  const row = db
    .prepare(`SELECT id, week_start, content, created_at FROM agent_reports WHERE user_id = ? ORDER BY week_start DESC LIMIT 1`)
    .get(DEFAULT_USER_ID) as ReportRow | undefined;
  if (!row) return null;
  return { id: row.id, weekStart: row.week_start, content: row.content, createdAt: row.created_at };
}
