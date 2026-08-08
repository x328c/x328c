# S4 forum controlled beta migration rehearsal

Date: 2026-08-01  
Database engine: disposable `mysql:8.0` container  
Production or repository `.env` database used: no

## Migration boundary

Only `20260801170000_s4_forum_controlled_beta` was added for S4. It adds the forum invitation
marker and report evidence snapshot, creates the board, post, image, first-level reply, like, and
user-restriction tables, and inserts the four controlled-beta boards. No historical migration was
edited, renamed, merged, or deleted.

The three V1 migration SHA-256 values remain:

```text
01c478934e3469f131ecc772eb8b211293b4259ee2933b8effe0c89fee0e8a6e  20260712072235_init_system_setting/migration.sql
2feb168c60534f58119c11deb215a1e3ae6dcfd419cbaac9e498a4370a25a3d3  20260712084022_schema_v1_core/migration.sql
fe09ddc0a179e43fb4144d29dee5f654f1b2f25d0fc94493fb21c60e7b34521f  20260712125039_add_file_records/migration.sql
```

## Empty database rehearsal

An explicit disposable database named `s4_empty` received the complete repository chain:

```bash
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/s4_empty' npx prisma migrate deploy
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/s4_empty' npx prisma migrate status
npx prisma migrate diff --from-url 'mysql://root:<TEST_PASSWORD>@127.0.0.1:33316/s4_empty' --to-schema-datamodel prisma/schema.prisma --exit-code
```

Observed result:

- all seven migrations applied in chronological order;
- migration status reported the schema up to date;
- drift check returned `No difference detected` with exit code 0;
- the S4 migration created six tables and exactly four seed boards;
- the first rehearsal exposed a MySQL 64-character generated-index-name limit before the migration
  could finish. Explicit short Prisma index map names fixed it, and a newly recreated empty database
  then passed the complete rehearsal.

## V1 snapshot upgrade rehearsal

A temporary Prisma migration directory containing only the three byte-identical V1 migrations
created `s4_v1`. Before upgrade, non-production sentinels were inserted into `system_settings`,
`users`, `admin_users`, `rides`, and `file_records`.

The repository chain then applied S1 through S4. Verification returned:

```text
system setting sentinel = 1
user sentinel           = 1 (forum_invited default = 0)
admin sentinel          = 1
ride sentinel           = 1
file sentinel           = 1
finished migrations     = 7
forum tables            = 6
seeded boards           = 4
report snapshot column  = 1
```

A second `migrate deploy` reported `No pending migrations to apply`; the final drift check returned
`No difference detected` with exit code 0.

## Database E2E proof

An isolated database named `s4_forum_test` received the complete seven-migration chain. The combined
E2E run passed `forum-flow.e2e-spec.ts`, `route-flow.e2e-spec.ts`, and
`regulation-flow.e2e-spec.ts`: three suites and six tests.

The forum flow proved pending/error content cannot escape through public list, detail, or an
undeclared search route; covered owner/administrator boundaries, sanitization, image validation,
durable duplicate submission, unique likes, restrictions, rate limits, reports, moderation retries,
board closure, read-only recovery, audit logs, and down/offline state. With `forum.enabled=false`, the
forum returned 503 while the V1 rides endpoint remained available.

## Recovery boundary

This migration is additive. Application rollback keeps `forum.enabled=false` and
`forum.write_enabled=false`, then rolls back application code; forum content, reports, restrictions,
and audit evidence remain available for inspection. Production deployment still requires an
approved backup/restore rehearsal and must not enable publishing until official moderation
credentials, content-safety qualification, and an operations duty roster are ready.
