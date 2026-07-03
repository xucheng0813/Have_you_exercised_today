import Database from 'better-sqlite3';
import {
  categoryOf,
  type Activity,
  type AdminUserSummary,
  type Checkin,
  type CheckinSource,
  type CheckinWithUser,
  type User,
  type WeeklyReport,
} from '@fitness/shared';
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

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(
    key,
    value
  );
}

/** 首次启动（用户表为空）时创建默认用户，网页端无飞书也能直接用；已删除的不再重建 */
if ((db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n === 0) {
  db.prepare(`INSERT INTO users (id, name) VALUES (1, ?)`).run(env.userName);
}

/* ---------------- users ---------------- */

interface UserRow {
  id: number;
  feishu_open_id: string | null;
  name: string;
}

function mapUser(r: UserRow): User {
  return { id: r.id, name: r.name, feishuOpenId: r.feishu_open_id };
}

export function listUsers(): User[] {
  const rows = db.prepare(`SELECT id, feishu_open_id, name FROM users ORDER BY id ASC`).all() as UserRow[];
  return rows.map(mapUser);
}

export function getUser(id: number): User | null {
  const row = db.prepare(`SELECT id, feishu_open_id, name FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(name: string): User {
  const info = db.prepare(`INSERT INTO users (name) VALUES (?)`).run(name);
  return getUser(Number(info.lastInsertRowid))!;
}

export function renameUser(id: number, name: string): void {
  db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(name, id);
}

/** 飞书用户首次发消息时自动建档 */
export function getOrCreateUserByOpenId(openId: string, name?: string): User {
  const row = db
    .prepare(`SELECT id, feishu_open_id, name FROM users WHERE feishu_open_id = ?`)
    .get(openId) as UserRow | undefined;
  if (row) return mapUser(row);
  const info = db
    .prepare(`INSERT INTO users (feishu_open_id, name) VALUES (?, ?)`)
    .run(openId, name ?? `健友${openId.slice(-4)}`);
  return getUser(Number(info.lastInsertRowid))!;
}

export function usersWithFeishu(): User[] {
  return listUsers().filter((u) => u.feishuOpenId !== null);
}

/** 成员概览：打卡数 + 最后打卡日期 */
export function userSummaries(): AdminUserSummary[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.feishu_open_id, COUNT(c.id) AS checkin_count, MAX(c.date) AS last_date
       FROM users u LEFT JOIN checkins c ON c.user_id = u.id
       GROUP BY u.id ORDER BY u.id ASC`
    )
    .all() as { id: number; name: string; feishu_open_id: string | null; checkin_count: number; last_date: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    feishuOpenId: r.feishu_open_id,
    checkinCount: r.checkin_count,
    lastDate: r.last_date,
  }));
}

export function countUsers(): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
}

/** 删除成员及其全部数据 */
export const deleteUser = db.transaction((id: number): boolean => {
  db.prepare(`DELETE FROM agent_reports WHERE user_id = ?`).run(id);
  db.prepare(`DELETE FROM checkins WHERE user_id = ?`).run(id);
  return db.prepare(`DELETE FROM users WHERE id = ?`).run(id).changes > 0;
});

/* ---------------- checkins ---------------- */

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
  userId: number;
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
      input.userId,
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

export function deleteCheckin(id: number, userId: number): boolean {
  return db.prepare(`DELETE FROM checkins WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
}

export function listCheckins(userId: number, from: string, to: string): Checkin[] {
  const rows = db
    .prepare(
      `SELECT * FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date DESC, created_at DESC`
    )
    .all(userId, from, to) as CheckinRow[];
  return rows.map(mapCheckin);
}

/** 全部成员的最近打卡记录（带成员名），后台管理用 */
export function listRecentCheckinsAll(limit: number): CheckinWithUser[] {
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS user_name FROM checkins c JOIN users u ON u.id = c.user_id
       ORDER BY c.date DESC, c.created_at DESC LIMIT ?`
    )
    .all(limit) as (CheckinRow & { user_name: string })[];
  return rows.map((r) => ({ ...mapCheckin(r), userName: r.user_name }));
}

/** 该用户全部打卡日期（去重、升序），供 streak 计算 */
export function allCheckinDates(userId: number): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT date FROM checkins WHERE user_id = ? ORDER BY date ASC`)
    .all(userId) as { date: string }[];
  return rows.map((r) => r.date);
}

/** 最近一次力量类训练的日期（运动名自由输入，按分类器判断） */
export function latestStrengthDate(userId: number): string | null {
  const rows = db
    .prepare(`SELECT DISTINCT date, activity FROM checkins WHERE user_id = ? ORDER BY date DESC`)
    .all(userId) as { date: string; activity: Activity }[];
  for (const r of rows) {
    if (categoryOf(r.activity) === 'strength') return r.date;
  }
  return null;
}

/* ---------------- agent reports ---------------- */

interface ReportRow {
  id: number;
  week_start: string;
  content: string;
  created_at: string;
}

export function saveReport(userId: number, weekStart: string, content: string): void {
  db.prepare(
    `INSERT INTO agent_reports (user_id, week_start, content) VALUES (?, ?, ?)
     ON CONFLICT (user_id, week_start) DO UPDATE SET content = excluded.content, created_at = datetime('now', 'localtime')`
  ).run(userId, weekStart, content);
}

export function latestReport(userId: number): WeeklyReport | null {
  const row = db
    .prepare(
      `SELECT id, week_start, content, created_at FROM agent_reports WHERE user_id = ? ORDER BY week_start DESC LIMIT 1`
    )
    .get(userId) as ReportRow | undefined;
  if (!row) return null;
  return { id: row.id, weekStart: row.week_start, content: row.content, createdAt: row.created_at };
}
