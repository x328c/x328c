#!/bin/sh
set -eu

echo "[startup] jiangxing-backend starting"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[startup] ERROR: DATABASE_URL is not configured. Set a MySQL URL reachable from WeChat CloudBase; localhost cannot be used."
  exit 1
fi

# 默认迁移生产库；多副本或临时排障时可在云托管环境变量中设为 false。
if [ "${RUN_PRISMA_MIGRATIONS:-true}" = "true" ]; then
  echo "[startup] applying Prisma migrations"
  npx --no-install prisma migrate deploy --schema=prisma/schema.prisma
fi

echo "[startup] starting NestJS on port ${PORT:-3000}"
exec node dist/main
