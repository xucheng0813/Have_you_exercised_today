import 'dotenv/config';

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
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    get enabled() {
      return Boolean(this.apiKey);
    },
  },
  remindCron: process.env.REMIND_CRON ?? '0 21 * * *',
  reportCron: process.env.REPORT_CRON ?? '0 9 * * 1',
};
