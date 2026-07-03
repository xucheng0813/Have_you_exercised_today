import cron from 'node-cron';
import { env } from './env.js';
import { addDays, mondayOf, todayStr } from './dates.js';
import { latestReport, listCheckins, listUsers, saveReport, usersWithFeishu } from './db.js';
import { computeStats } from './stats.js';
import { generateWeeklyReport } from './agent/deepseek.js';
import { sendTextToOpenId } from './feishu/index.js';

/** 为单个用户生成并保存上一周的 AI 周报（DeepSeek 未配置时返回 null） */
export async function runWeeklyReport(userId: number): Promise<string | null> {
  const lastMonday = addDays(mondayOf(todayStr()), -7);
  const checkins = listCheckins(userId, lastMonday, addDays(lastMonday, 6));
  const content = await generateWeeklyReport(lastMonday, checkins);
  if (!content) return null;
  saveReport(userId, lastMonday, content);
  return content;
}

export function startJobs(): void {
  if (env.remindCron && cron.validate(env.remindCron)) {
    cron.schedule(env.remindCron, async () => {
      for (const user of usersWithFeishu()) {
        try {
          const stats = computeStats(user.id);
          if (stats.today.checked) continue;
          await sendTextToOpenId(
            user.feishuOpenId!,
            `⏰ 今天还没打卡哦～练完回我一句就行。\n休息日也可以回「休息」，不断连续记录（当前 🔥 ${stats.streak} 天）。`
          );
          console.log(`[jobs] 已提醒 ${user.name}`);
        } catch (err) {
          console.error(`[jobs] 提醒 ${user.name} 失败:`, err);
        }
      }
    });
    console.log(`[jobs] 每日提醒已启动 (${env.remindCron})`);
  }

  if (env.reportCron && cron.validate(env.reportCron)) {
    cron.schedule(env.reportCron, async () => {
      for (const user of listUsers()) {
        try {
          const content = await runWeeklyReport(user.id);
          if (content && user.feishuOpenId) {
            await sendTextToOpenId(user.feishuOpenId, `📋 AI 教练周报\n\n${content}`);
          }
          if (content) console.log(`[jobs] ${user.name} 的周报已生成`);
        } catch (err) {
          console.error(`[jobs] ${user.name} 的周报生成失败:`, err);
        }
      }
    });
    console.log(`[jobs] AI 周报已启动 (${env.reportCron})`);
  }

  // 兜底：启动时补生成缺失的上周周报（只补有打卡记录的用户）
  void (async () => {
    if (!env.deepseek.enabled) return;
    const lastMonday = addDays(mondayOf(todayStr()), -7);
    for (const user of listUsers()) {
      if (latestReport(user.id)?.weekStart === lastMonday) continue;
      if (listCheckins(user.id, lastMonday, addDays(lastMonday, 6)).length === 0) continue;
      try {
        await runWeeklyReport(user.id);
        console.log(`[jobs] 启动补生成 ${user.name} 的上周周报完成`);
      } catch (err) {
        console.error(`[jobs] 启动补生成 ${user.name} 的周报失败:`, err);
      }
    }
  })();
}
