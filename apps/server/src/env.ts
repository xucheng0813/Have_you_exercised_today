import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// 先读运行目录的 .env，再补仓库根目录的 .env（已存在的变量不会被覆盖）
dotenv.config();
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? './data.db',
  userName: process.env.USER_NAME ?? '我',
  feishu: {
    appId: process.env.FEISHU_APP_ID ?? '',
    appSecret: process.env.FEISHU_APP_SECRET ?? '',
    get enabled() {
      return Boolean(this.appId && this.appSecret);
    },
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
    get enabled() {
      return Boolean(this.apiKey);
    },
  },
  remindCron: process.env.REMIND_CRON ?? '0 21 * * *',
  reportCron: process.env.REPORT_CRON ?? '0 9 * * 1',
};
