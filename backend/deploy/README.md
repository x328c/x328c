# Ubuntu 24.04 + Docker 29 生产部署

本部署包会在一台服务器上运行 NestJS 后端、MySQL 8、Redis 7 与 Nginx。
仅 Nginx 绑定宿主机端口（`80`）；MySQL、Redis 与 NestJS 的 `3000` 端口只在
Docker 内部网络中可访问。

## 部署前准备

1. 为服务器解析域名。若服务面向生产小程序，请按实际要求完成备案，并在将域名
   加入微信 request 合法域名之前配置 HTTPS。
2. 在云厂商安全组中仅放行 SSH 与 TCP `80/443`，不要开放 `3000`、`3306`、`6379`。
3. 将仓库中的 `backend/` 目录放到 `/var/www/jiangxing/backend`。不要把本地 `.env`
   文件或 `node_modules/` 上传到服务器。当前工作目录没有 Git 元数据；只有在你已创建
   自己的远程仓库时才使用 Git 克隆，否则请通过 SSH 文件传输工具上传后端源代码。
4. 在该目录执行 `bash deploy/scripts/prepare-server.sh`。除非明确设置
   `ENABLE_UFW=1`，该脚本不会修改 UFW 防火墙规则。

## 首次部署

```bash
cd /var/www/jiangxing/backend
bash deploy/scripts/prepare-server.sh
bash deploy/scripts/init-production-env.sh
nano .env.production
bash deploy/scripts/deploy.sh
```

初始化脚本会生成独立的 MySQL、Redis、JWT 随机密钥，并将 `.env.production` 权限设置为
`600`。部署前必须填写生产微信登录和 COS 配置；若启用内容安全，还需填写腾讯云 CMS
密钥并设置 `CONTENT_SECURITY_ENABLED=true`。

`deploy.sh` 会构建镜像、等待 Prisma 迁移与容器健康检查，然后请求
`http://127.0.0.1/healthz` 验证部署。HTTPS 配置完成前，公开健康检查地址为：

```text
http://<服务器地址>/api/v1/health
```

## HTTPS 与后续更新

由于尚未提供域名和证书，随附的 Nginx 配置仅提供 HTTP。生产小程序必须先添加有效
证书与 `443` HTTPS 配置，再把 API 域名加入小程序合法域名列表。请勿使用裸 IP 地址，
也不要绕过证书错误。

每次更新代码时，先更新服务器上的源代码，再重新构建：

```bash
cd /var/www/jiangxing/backend
# 仅当此目录来自你自己的 Git 远程仓库时执行：
git pull --ff-only
bash deploy/scripts/deploy.sh
```

如果采用文件传输而非 Git 克隆，请重新上传源码时保留 `.env.production` 与 `deploy/`
目录，然后执行相同的 `deploy.sh` 命令。

## 备份与运维

```bash
cd /var/www/jiangxing/backend
bash deploy/scripts/backup-mysql.sh
docker compose --env-file .env.production -f deploy/docker-compose.production.yml logs -f app
docker compose --env-file .env.production -f deploy/docker-compose.production.yml ps
```

备份脚本默认在 `/var/backups/jiangxing` 中保留 14 天备份。请将备份加密后同步到服务器
外部；只保存在应用服务器上的备份无法应对服务器丢失或损坏。
