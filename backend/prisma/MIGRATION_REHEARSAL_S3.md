# S3 regulation search MVP migration rehearsal

Date: 2026-08-01  
Database engine: disposable `mysql:8.0` container  
Production or repository `.env` database used: no

## Migration boundary

Only `20260801110000_s3_regulation_search_mvp` was added for S3. It creates the regulation,
revision, normalized tag/region, feedback, and CSV import task/row tables plus their indexes and
foreign keys. No historical migration was edited, renamed, merged, or deleted.

The three V1 migration SHA-256 values remain:

```text
01c478934e3469f131ecc772eb8b211293b4259ee2933b8effe0c89fee0e8a6e  20260712072235_init_system_setting/migration.sql
2feb168c60534f58119c11deb215a1e3ae6dcfd419cbaac9e498a4370a25a3d3  20260712084022_schema_v1_core/migration.sql
fe09ddc0a179e43fb4144d29dee5f654f1b2f25d0fc94493fb21c60e7b34521f  20260712125039_add_file_records/migration.sql
```

## Empty database rehearsal

An explicit disposable database named `modazi_s3_empty` received the repository chain:

```bash
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33318/modazi_s3_empty' npx prisma migrate deploy
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33318/modazi_s3_empty' npx prisma migrate status
npx prisma migrate diff --from-url 'mysql://root:<TEST_PASSWORD>@127.0.0.1:33318/modazi_s3_empty' --to-schema-datamodel prisma/schema.prisma --exit-code
```

Observed result:

- all six migrations applied in chronological order;
- migration status reported the schema up to date;
- drift check returned `No difference detected` with exit code 0;
- the S3 migration created eight tables: `regulations`, `regulation_revisions`,
  `regulation_tags`, `regulation_tag_links`, `regulation_regions`, `regulation_feedbacks`,
  `regulation_import_tasks`, and `regulation_import_rows`.

## V1 snapshot upgrade rehearsal

A temporary Prisma migration directory containing only the three unchanged V1 migrations created
`modazi_s3_v1`. Before upgrade, one non-production sentinel was inserted into each of
`system_settings`, `users`, `admin_users`, and `rides`.

The repository chain then applied only S1, S2, and S3. Verification returned:

```text
system setting sentinel = 1
user sentinel           = 1
admin sentinel          = 1
ride sentinel           = 1
finished migrations     = 6
queried S3 core tables  = 7/7
```

A second `migrate deploy` reported `No pending migrations to apply`; the final drift check returned
`No difference detected` with exit code 0.

## Database E2E proof

An isolated `modazi_s3_test` database received the full six-migration chain. The API test
`test/regulation-flow.e2e-spec.ts` passed this flow:

```text
CSV upload/validate/preview -> duplicate task recognized -> confirm as draft
-> creator submits -> same-person review rejected -> different reviewer approves
-> reviewer publish rejected -> super-admin publishes -> Chinese search -> source detail
-> link-failure feedback enters queue -> feedback resolved -> create v2 draft
-> public response remains on immutable v1 and its publication snapshot is complete
-> expire -> repeated expire rejected -> default filter hides it -> offline
```

The same test proved publish, expire, offline, feedback resolution, and import confirmation append
operation logs with request IDs. With `regulation.enabled=false`, regulation APIs returned 503 while
the existing rides endpoint remained available.

## Recovery boundary

This migration is additive. Application rollback keeps `regulation.enabled=false` and rolls back
application code; regulation history, feedback, imports, and audit evidence remain available for
inspection. Production deployment still requires an approved backup and restore rehearsal against a
current production copy.
