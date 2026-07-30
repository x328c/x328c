# 依赖阶段：安装生产构建、Prisma 生成所需的 Node 依赖。
FROM node:20-alpine AS dependencies

WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# 构建阶段：生成与 Alpine 兼容的 Prisma Client，并编译 NestJS。
FROM dependencies AS build

COPY prisma ./prisma
RUN npx prisma generate
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# 运行阶段：只保留构建产物、Prisma CLI 和运行所需依赖。
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000

RUN apk add --no-cache openssl libc6-compat tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo Asia/Shanghai > /etc/timezone

COPY package.json package-lock.json ./
# 容器以 node 普通用户运行，避免应用进程获得 root 权限。
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node deploy/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0555 ./docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
