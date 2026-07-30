# 微信云托管构建模板：将此文件复制到 backend/Dockerfile 后，以 backend 为构建上下文。
FROM node:20-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000
# Prisma 在容器启动时执行 migrate deploy，因此运行镜像需要 Prisma CLI 与 OpenSSL。
RUN apk add --no-cache openssl libc6-compat tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo Asia/Shanghai > /etc/timezone
COPY package.json package-lock.json ./
# 必须从 build 阶段复制：该阶段已执行 prisma generate，包含与 Alpine 运行环境匹配的 Prisma Client。
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
