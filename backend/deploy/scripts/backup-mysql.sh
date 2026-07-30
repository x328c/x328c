#!/usr/bin/env bash
# 创建一致性的 MySQL 备份；默认保留 14 天。
set -Eeuo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${BACKEND_ROOT}/.env.production"
COMPOSE_FILE="${BACKEND_ROOT}/deploy/docker-compose.production.yml"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jiangxing}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE"; exit 1; }
[[ "$BACKUP_DIR" == "/var/backups/jiangxing" || "$BACKUP_DIR" == "/var/backups/jiangxing/"* ]] || {
  echo "BACKUP_DIR 必须是 /var/backups/jiangxing 或其子目录。"
  exit 1
}

install -d -m 0700 "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
output="${BACKUP_DIR}/jiangxing-${timestamp}.sql.gz"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mysql \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --events "$MYSQL_DATABASE"' \
  | gzip -9 > "$output"

test -s "$output"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'jiangxing-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "Backup created: $output"
