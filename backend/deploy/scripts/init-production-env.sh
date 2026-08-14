#!/usr/bin/env bash
# 创建仅存放于服务器本机的生产环境变量文件，并生成加密安全的随机密钥。
set -Eeuo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${BACKEND_ROOT}/.env.production"

if [[ -e "$ENV_FILE" ]]; then
  echo "Refusing to overwrite existing $ENV_FILE"
  exit 1
fi

for command in openssl install; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command"
    exit 1
  }
done

random_hex() {
  openssl rand -hex 32
}

mysql_password="$(random_hex)"
mysql_root_password="$(random_hex)"
redis_password="$(random_hex)"
access_secret="$(random_hex)"
refresh_secret="$(random_hex)"
admin_secret="$(random_hex)"

umask 077
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
TZ=Asia/Shanghai

MYSQL_DATABASE=jiangxing_db
MYSQL_USER=jiangxing
MYSQL_PASSWORD=${mysql_password}
MYSQL_ROOT_PASSWORD=${mysql_root_password}
DATABASE_URL=mysql://jiangxing:${mysql_password}@mysql:3306/jiangxing_db
RUN_PRISMA_MIGRATIONS=true

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}
REDIS_DB=0

JWT_ACCESS_SECRET=${access_secret}
JWT_REFRESH_SECRET=${refresh_secret}
JWT_ACCESS_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d
ADMIN_JWT_SECRET=${admin_secret}
ADMIN_JWT_EXPIRES_IN=8h

# 部署前必须填写以下配置
WECHAT_APP_ID=your-wechat-appid
WECHAT_APP_SECRET=your-wechat-secret

COS_SECRET_ID=your-cos-secret-id
COS_SECRET_KEY=your-cos-secret-key
COS_BUCKET=your-cos-bucket
COS_REGION=ap-chengdu
COS_CDN_DOMAIN=https://your-cos-cdn-domain.com
COS_APP_ID=your-cos-app-id

TENCENT_COS_BUCKET=your-bucket
TENCENT_COS_REGION=ap-beijing
SUBSCRIPTION_MESSAGE_ENABLED=false
WECHAT_SUBSCRIBE_RIDE_JOIN_TEMPLATE_ID=your-template-id
WECHAT_SUBSCRIBE_RIDE_DEPARTURE_TEMPLATE_ID=your-template-id
WECHAT_SUBSCRIBE_RIDE_CANCEL_TEMPLATE_ID=your-template-id
WECHAT_SUBSCRIBE_ACTIVITY_AUDIT_TEMPLATE_ID=your-template-id
WECHAT_SUBSCRIBE_ACTIVITY_CANCEL_TEMPLATE_ID=your-template-id
EOF

echo "Created $ENV_FILE with mode 600. Fill in the WeChat and COS settings before deployment."
