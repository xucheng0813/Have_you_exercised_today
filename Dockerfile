# syntax=docker/dockerfile:1
# 基础镜像用 Debian（glibc）：better-sqlite3 有官方预编译二进制，无需装编译链

# ---- 构建阶段：全量依赖 + 构建前端 ----
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages ./packages
COPY apps ./apps
RUN npm run build

# ---- 运行阶段：只装 server 的生产依赖 ----
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/server/package.json apps/server/
# web 的 package.json 仅用于 npm 校验 workspace 结构，产物在下面从 builder 拷入
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/server --omit=dev
COPY apps/server ./apps/server
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# SQLite 数据（打卡记录 + 飞书/DeepSeek 凭证）都在 /data 卷里，备份拷这一个目录即可
ENV DATABASE_PATH=/data/data.db
RUN mkdir -p /data
VOLUME /data

# 打卡日期、每日 21:00 提醒都按本地时区算，默认东八区
ENV TZ=Asia/Shanghai
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/setup').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start", "-w", "apps/server"]
