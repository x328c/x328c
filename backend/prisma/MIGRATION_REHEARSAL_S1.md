# S1 V2 common migration rehearsal

Date: 2026-07-31  
Database engine: disposable `mysql:8.0` container  
Production or repository `.env` database used: no

## Historical migration integrity

The three V1 migration files had identical SHA-256 values before and after S1-06:

```text
01c478934e3469f131ecc772eb8b211293b4259ee2933b8effe0c89fee0e8a6e  20260712072235_init_system_setting/migration.sql
2feb168c60534f58119c11deb215a1e3ae6dcfd419cbaac9e498a4370a25a3d3  20260712084022_schema_v1_core/migration.sql
fe09ddc0a179e43fb4144d29dee5f654f1b2f25d0fc94493fb21c60e7b34521f  20260712125039_add_file_records/migration.sql
```

Only `20260731130000_s1_v2_common_foundation` was added. It creates `feature_flags` and append-only `operation_logs`; it does not alter a V1 table.

## Empty database rehearsal

Procedure, using an explicit disposable URL instead of `.env`:

```bash
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/modazi_s1_empty' npx prisma migrate deploy
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/modazi_s1_empty' npx prisma migrate status
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/modazi_s1_empty' npx prisma migrate diff --from-url 'mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/modazi_s1_empty' --to-schema-datamodel prisma/schema.prisma --exit-code
```

Observed result:

- all four migrations applied in order;
- `feature_flags` and `operation_logs` both existed;
- `_prisma_migrations` contained four finished migrations;
- status reported the schema up to date;
- drift check returned `No difference detected` with exit code 0.

## V1 snapshot upgrade rehearsal

The snapshot was built with a temporary Prisma directory containing only the three unchanged historical migrations. Before upgrading, non-production sentinel rows were inserted into `system_settings`, `users`, and `admin_users`.

The repository migration chain was then deployed against that snapshot:

```bash
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/modazi_s1_v1' npx prisma migrate deploy
```

Observed result:

- Prisma applied only `20260731130000_s1_v2_common_foundation`;
- the setting, user, and administrator sentinels were each still present exactly once;
- an `operation_logs` row recorded administrator ID, action, object type/ID, reason, request ID, and a non-null creation time;
- a second `migrate deploy` reported `No pending migrations to apply`;
- `_prisma_migrations` still contained exactly four finished rows;
- the audit sentinel still existed exactly once after the repeated deployment;
- drift check returned `No difference detected` with exit code 0.

## Recovery boundary

This migration is additive. Application rollback is performed by keeping all V2 feature flags closed and rolling back application code; generated business/audit data is not automatically deleted. A production migration still requires an approved backup and restore rehearsal on a current production data copy. The disposable rehearsal container was removed after verification.
