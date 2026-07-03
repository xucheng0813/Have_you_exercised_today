import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { NewCheckin, SetupStatus } from '@fitness/shared';
import { env } from './env.js';
import {
  createUser,
  deleteCheckin,
  getUser,
  insertCheckin,
  latestReport,
  listCheckins,
  listUsers,
  usersWithFeishu,
} from './db.js';
import { computeStats } from './stats.js';
import { addDays, isValidDateStr, todayStr } from './dates.js';
import { feishuCredentials, saveFeishuCredentials, startFeishu } from './feishu/index.js';
import { runWeeklyReport, startJobs } from './jobs.js';

const app = new Hono();

/** 解析 ?userId=，缺省为默认用户 1；用户不存在返回 null */
function resolveUserId(raw: string | undefined): number | null {
  const id = raw === undefined ? 1 : Number(raw);
  if (!Number.isInteger(id) || !getUser(id)) return null;
  return id;
}

app.get('/api/users', (c) => c.json(listUsers()));

app.post('/api/users', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim().slice(0, 20);
  if (!name) return c.json({ error: 'name 不能为空' }, 400);
  return c.json(createUser(name), 201);
});

app.get('/api/stats', (c) => {
  const userId = resolveUserId(c.req.query('userId'));
  if (userId === null) return c.json({ error: '用户不存在' }, 404);
  return c.json(computeStats(userId));
});

app.get('/api/checkins', (c) => {
  const userId = resolveUserId(c.req.query('userId'));
  if (userId === null) return c.json({ error: '用户不存在' }, 404);
  const to = c.req.query('to') ?? todayStr();
  const from = c.req.query('from') ?? addDays(to, -180);
  if (!isValidDateStr(from) || !isValidDateStr(to)) {
    return c.json({ error: 'from/to 需为 YYYY-MM-DD' }, 400);
  }
  return c.json(listCheckins(userId, from, to));
});

app.post('/api/checkins', async (c) => {
  const body = (await c.req.json().catch(() => null)) as (NewCheckin & { userId?: number }) | null;
  const userId = resolveUserId(body?.userId === undefined ? undefined : String(body.userId));
  if (userId === null) return c.json({ error: '用户不存在' }, 404);
  const activity = typeof body?.activity === 'string' ? body.activity.trim().slice(0, 16) : '';
  if (!body || !activity) {
    return c.json({ error: 'activity 不能为空（如：跑步、攀岩、跳绳）' }, 400);
  }
  const date = body.date ?? todayStr();
  if (!isValidDateStr(date) || date > todayStr()) {
    return c.json({ error: 'date 无效（不能是未来日期）' }, 400);
  }
  const durationMin =
    body.durationMin == null ? null : Math.max(1, Math.min(24 * 60, Math.round(Number(body.durationMin))));
  if (durationMin !== null && Number.isNaN(durationMin)) {
    return c.json({ error: 'durationMin 需为数字' }, 400);
  }
  const checkin = insertCheckin({
    userId,
    date,
    activity,
    durationMin,
    note: body.note?.trim() || null,
    source: 'web',
  });
  return c.json(checkin, 201);
});

app.delete('/api/checkins/:id', (c) => {
  const userId = resolveUserId(c.req.query('userId'));
  if (userId === null) return c.json({ error: '用户不存在' }, 404);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || !deleteCheckin(id, userId)) return c.json({ error: '记录不存在' }, 404);
  return c.json({ ok: true });
});

app.get('/api/reports/latest', (c) => {
  const userId = resolveUserId(c.req.query('userId'));
  if (userId === null) return c.json({ error: '用户不存在' }, 404);
  return c.json(latestReport(userId));
});

app.post('/api/reports/generate', async (c) => {
  if (!env.deepseek.enabled) return c.json({ error: '未配置 DEEPSEEK_API_KEY' }, 400);
  const userId = resolveUserId(c.req.query('userId'));
  if (userId === null) return c.json({ error: '用户不存在' }, 404);
  const content = await runWeeklyReport(userId);
  return c.json({ content });
});

app.get('/api/setup', (c) => {
  const creds = feishuCredentials();
  const status: SetupStatus = {
    feishu: {
      configured: creds !== null,
      boundUsers: usersWithFeishu().length,
      appId: creds?.appId ?? null,
    },
    deepseek: { configured: env.deepseek.enabled, model: env.deepseek.model },
  };
  return c.json(status);
});

// 网页直接粘贴飞书凭证：校验 → 存 SQLite → 热启动长连接（无需重启服务）
app.post('/api/setup/feishu', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { appId?: string; appSecret?: string } | null;
  const appId = body?.appId?.trim();
  const appSecret = body?.appSecret?.trim();
  if (!appId || !appSecret) return c.json({ error: 'App ID 和 App Secret 都不能为空' }, 400);
  const error = await saveFeishuCredentials({ appId, appSecret });
  if (error) return c.json({ error }, 400);
  return c.json({ ok: true });
});

// 静态托管前端构建产物（SPA fallback 到 index.html）
const webDistAbs = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDistAbs)) {
  const root = path.relative(process.cwd(), webDistAbs) || '.';
  app.use('/*', serveStatic({ root }));
  app.get('*', serveStatic({ path: path.join(root, 'index.html') }));
} else {
  app.get('/', (c) => c.text('前端未构建：先运行 npm run build，或用 npm run dev:web 起开发服务器。'));
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[server] http://localhost:${info.port}`);
});

startFeishu();
startJobs();
