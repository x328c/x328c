# S5 Prisma 迁移演练记录

日期：2026-08-01（本地隔离容器）

## 空库

临时 MySQL 8 容器 `127.0.0.1:33316/jiangxing_s5` 执行：

```text
npx prisma migrate deploy
8 migrations found
all migrations have been successfully applied
```

包含 V1 三个历史迁移及 S1、S2、S3、S4、S5 增量迁移；历史目录未修改。

## V1+S1-S4 快照升级

第二个临时数据库先使用不含 S5 目录的迁移副本完成 7 个迁移，随后使用仓库完整目录执行：

```text
npx prisma migrate deploy
Applying migration `20260801190000_s5_integration_hardening`
All migrations have been successfully applied.
```

该路径证明已有 V1 数据库完成 S5 增量升级。容器及临时文件已删除；未使用 `.env` 或生产数据库。

