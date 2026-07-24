#!/bin/sh
set -eu

echo "[startup] jiangxing-backend starting"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[startup] ERROR: DATABASE_URL is not configured."
  exit 1
fi

# 生产环境默认执行已提交的 Prisma migration；多副本部署时应只让一个副本执行迁移。
if [ "${RUN_PRISMA_MIGRATIONS:-true}" = "true" ]; then
  echo "[startup] applying Prisma migrations"
  npx --no-install prisma migrate deploy --schema=prisma/schema.prisma
fi

echo "[startup] starting NestJS on port ${PORT:-3000}"
exec node dist/main
