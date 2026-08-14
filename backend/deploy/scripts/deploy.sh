#!/usr/bin/env bash
set -Eeuo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${BACKEND_ROOT}/.env.production"
COMPOSE_FILE="${BACKEND_ROOT}/deploy/docker-compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Run deploy/scripts/init-production-env.sh first."
  exit 1
fi

required_values=(WECHAT_APP_ID WECHAT_APP_SECRET COS_SECRET_ID COS_SECRET_KEY COS_BUCKET COS_CDN_DOMAIN)
# 这些配置会在微信登录或 COS 上传功能首次调用时被后端读取，部署前即强制校验。
for key in "${required_values[@]}"; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | cut -d= -f2-)"
  if [[ -z "$value" ]]; then
    echo "Missing required production setting: ${key}"
    exit 1
  fi
done

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "等待公开健康检查接口就绪..."
for _ in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1/healthz \
    && curl --fail --silent --show-error --output /dev/null http://127.0.0.1/admin/; then
    echo
    echo "Deployment succeeded: API and admin console are ready."
    exit 0
  fi
  sleep 2
done

echo "Health check failed. Inspect logs with:"
echo "docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs --tail=200"
exit 1
