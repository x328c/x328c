#!/usr/bin/env bash
# 在已安装部署说明中的基础软件后，于 Ubuntu 24.04 上执行一次。
# 除非明确设置 ENABLE_UFW=1，否则本脚本不会启用或修改 UFW。
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/var/www/jiangxing}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"
SSH_PORT="${SSH_PORT:-22}"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Engine and the Docker Compose plugin are required."
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate deployment secrets. Install it with: sudo apt install -y openssl"
  exit 1
fi

sudo install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_ROOT"
sudo install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/backups/jiangxing

if [[ "${ENABLE_UFW:-0}" == "1" ]]; then
  # 启用防火墙前先放行 SSH 当前端口，避免把自己锁在服务器外。
  sudo ufw allow "${SSH_PORT}/tcp"
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  sudo ufw status verbose
else
  cat <<EOF
UFW was not changed. After confirming the cloud security group allows the same
ports, enable it explicitly with:
  ENABLE_UFW=1 SSH_PORT=${SSH_PORT} bash deploy/scripts/prepare-server.sh
EOF
fi

echo "Server preparation complete. Deploy the backend source to ${APP_ROOT}/backend next."
