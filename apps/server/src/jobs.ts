import cron from 'node-cron';
import { env } from './env.js';
import { addDays, mondayOf, todayStr } from './dates.js';
import { latestReport, listCheckins, saveReport } from './db.js';
import { computeStats } from './stats.js';
import { generateWeeklyReport } from './agent/deepseek.js';
import { sendTextToUser } from './feishu/index.js';

/** 生成并保存上一周的 AI 周报，返回内容（DeepSeek 未配置时返回 null） */
export async function runWeeklyReport(): Promise<string | null> {
  const lastMonday = addDays(mondayOf(todayStr()), -7);
  const checkins = listCheckins(lastMonday, addDays(lastMonday, 6));
  const content = await generateWeeklyReport(lastMonday, checkins);
  if (!content) return null;
  saveReport(lastMonday, content);
  return content;
}

export function startJobs(): void {
  if (env.remindCron && cron.validate(env.remindCron)) {
    cron.schedule(env.remindCron, async () => {
      const stats = computeStats();
      if (stats.today.checked) return;
      const sent = await sendTextToUser(
        `⏰ 今天还没打卡哦～练完回我一句就行。\n休息日也可以回「休息」，不断连续记录（当前 🔥 ${stats.streak} 天）。`
      );
      if (sent) console.log('[jobs] 已发送每日提醒');
    });
    console.log(`[jobs] 每日提醒已启动 (${env.remindCron})`);
  }

  if (env.reportCron && cron.validate(env.reportCron)) {
    cron.schedule(env.reportCron, async () => {
      try {
        const content = await runWeeklyReport();
        if (content) {
          await sendTextToUser(`📋 AI 教练周报\n\n${content}`);
          console.log('[jobs] 周报已生成并推送');
        }
      } catch (err) {
        console.error('[jobs] 周报生成失败:', err);
      }
    });
    console.log(`[jobs] AI 周报已启动 (${env.reportCron})`);
  }

  // 兜底：启动时如果上周还没有周报且配置了 DeepSeek，补生成一次
  void (async () => {
    const lastMonday = addDays(mondayOf(todayStr()), -7);
    if (env.deepseek.enabled && latestReport()?.weekStart !== lastMonday) {
      try {
        await runWeeklyReport();
        console.log('[jobs] 启动补生成上周周报完成');
      } catch (err) {
        console.error('[jobs] 启动补生成周报失败:', err);
      }
    }
  })();
}
