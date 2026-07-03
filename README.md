# 今天练了吗 · Have you exercised today

健身打卡统计服务：在飞书里发一句话完成打卡，DeepSeek 解析成结构化记录存入 SQLite，网页仪表盘查看连续打卡、热力图和 AI 教练周报。

## 技术栈

- **后端**：Node + Hono + TypeScript，better-sqlite3（单文件 `data.db`）
- **前端**：React + Vite + TanStack Query（Apple 风格设计，见 `docs/` 设计稿）
- **飞书**：`@larksuiteoapi/node-sdk` 长连接事件订阅（参考 multica 模式，无需公网回调地址），网页扫码即可完成绑定
- **AI**：DeepSeek `deepseek-v4-flash`（OpenAI 兼容 SDK，[官方文档](https://api-docs.deepseek.com/zh-cn/)）—— 自由识别任意运动类型 + 每周教练点评

## 快速开始

```bash
npm install
cp .env.example .env   # 按需填入飞书 / DeepSeek 配置
npm run build          # 构建前端
npm start              # 启动服务 → http://localhost:3000
```

开发模式（前端热更新）：

```bash
npm run dev:server     # 后端 :3000（tsx watch）
npm run dev:web        # 前端 :5173（/api 代理到 :3000）
```

不配置任何 key 也能跑：网页手动打卡 + 全部统计可用；飞书和 AI 功能自动跳过。

## 飞书接入

1. 在[飞书开放平台](https://open.feishu.cn)创建**企业自建应用**，拿到 App ID / App Secret 填入 `.env`
2. 开通权限：`im:message`（读取消息）、`im:message:send_as_bot`（发送消息）
3. 事件订阅选择**「使用长连接接收事件」**，添加事件 `im.message.receive_v1`（无需配置回调 URL）
4. 发布应用，打开网页仪表盘底部「接入」区块，**用飞书扫一扫二维码**打开机器人，随便发一句话即自动完成绑定

机器人用法（运动类型由 DeepSeek 自由识别，攀岩、跳绳、飞盘都认得）：

- `打卡 晚上跑了5公里 35分钟` → 记录一次跑步
- `休息` → 记录休息日（保住连续记录）
- `统计` → 查看当前数据
- 每天 21:00 未打卡自动提醒；每周一早上推送 AI 周报（需 DeepSeek）

## API

| 方法 & 路径 | 说明 |
| --- | --- |
| `GET /api/stats` | 今日状态、连续天数、本周/本月统计 |
| `GET /api/checkins?from=&to=` | 区间打卡记录 |
| `POST /api/checkins` | 手动打卡 `{ date?, activity, durationMin?, note? }` |
| `DELETE /api/checkins/:id` | 删除记录 |
| `GET /api/reports/latest` | 最近一期 AI 周报 |
| `POST /api/reports/generate` | 手动生成上周周报 |
