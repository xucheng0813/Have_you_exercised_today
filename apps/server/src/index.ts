import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { NewCheckin, SetupStatus } from '@fitness/shared';
import { env } from './env.js';
import { deleteCheckin, getUserFeishuOpenId, insertCheckin, latestReport, listCheckins } from './db.js';
import { computeStats } from './stats.js';
import { addDays, isValidDateStr, todayStr } from './dates.js';
import { startFeishu } from './feishu/index.js';
import { runWeeklyReport, startJobs } from './jobs.js';

const app = new Hono();

app.get('/api/stats', (c) => c.json(computeStats()));

app.get('/api/checkins', (c) => {
  const to = c.req.query('to') ?? todayStr();
  const from = c.req.query('from') ?? addDays(to, -180);
  if (!isValidDateStr(from) || !isValidDateStr(to)) {
    return c.json({ error: 'from/to 需为 YYYY-MM-DD' }, 400);
  }
  return c.json(listCheckins(from, to));
});

app.post('/api/checkins', async (c) => {
  const body = (await c.req.json().catch(() => null)) as NewCheckin | null;
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
    date,
    activity,
    durationMin,
    note: body.note?.trim() || null,
    source: 'web',
  });
  return c.json(checkin, 201);
});

app.get('/api/setup', (c) => {
  const status: SetupStatus = {
    feishu: {
      configured: env.feishu.enabled,
      bound: Boolean(getUserFeishuOpenId()),
      appId: env.feishu.appId || null,
    },
    deepseek: { configured: env.deepseek.enabled, model: env.deepseek.model },
  };
  return c.json(status);
});

app.delete('/api/checkins/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || !deleteCheckin(id)) return c.json({ error: '记录不存在' }, 404);
  return c.json({ ok: true });
});

app.get('/api/reports/latest', (c) => c.json(latestReport()));

app.post('/api/reports/generate', async (c) => {
  if (!env.deepseek.enabled) return c.json({ error: '未配置 DEEPSEEK_API_KEY' }, 400);
  const content = await runWeeklyReport();
  return c.json({ content });
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
