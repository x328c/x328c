# S2 route curated MVP migration rehearsal

Date: 2026-07-31; route state/count E2E revalidated 2026-08-01  
Database engine: disposable `mysql:8.0` container  
Production or repository `.env` database used: no

## Migration boundary

Only `20260731170000_s2_route_curated_mvp` was added for S2. It creates `routes`, `route_points`, `route_favorites`, and `route_ride_links` plus their indexes and foreign keys. It does not alter a V1 table or an executed migration.

The three V1 migration SHA-256 values remained identical to the S1 rehearsal:

```text
01c478934e3469f131ecc772eb8b211293b4259ee2933b8effe0c89fee0e8a6e  20260712072235_init_system_setting/migration.sql
2feb168c60534f58119c11deb215a1e3ae6dcfd419cbaac9e498a4370a25a3d3  20260712084022_schema_v1_core/migration.sql
fe09ddc0a179e43fb4144d29dee5f654f1b2f25d0fc94493fb21c60e7b34521f  20260712125039_add_file_records/migration.sql
```

## Empty database rehearsal

An explicit disposable database named `modazi_s2_empty` was migrated with the repository chain:

```bash
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33317/modazi_s2_empty' npx prisma migrate deploy
DATABASE_URL='mysql://root:<TEST_PASSWORD>@127.0.0.1:33317/modazi_s2_empty' npx prisma migrate status
npx prisma migrate diff --from-url 'mysql://root:<TEST_PASSWORD>@127.0.0.1:33317/modazi_s2_empty' --to-schema-datamodel prisma/schema.prisma --exit-code
```

Observed result:

- all five migrations applied in order;
- all four S2 route tables existed;
- `_prisma_migrations` contained five finished migrations;
- migration status reported the schema up to date;
- drift check returned `No difference detected` with exit code 0.

## V1 snapshot upgrade rehearsal

A temporary Prisma directory containing only the three unchanged V1 migrations created `modazi_s2_v1`. Before upgrade, one non-production sentinel was inserted into each of `system_settings`, `users`, `admin_users`, and `rides`.

The repository chain was then deployed against that snapshot. Prisma applied only:

```text
20260731130000_s1_v2_common_foundation
20260731170000_s2_route_curated_mvp
```

Observed result:

- every V1 sentinel remained present exactly once;
- all four S2 route tables existed;
- the database contained five finished migration records;
- a second `migrate deploy` reported `No pending migrations to apply`;
- drift check returned `No difference detected` with exit code 0.

## E2E database proof

A third isolated database, `modazi_s2_test`, received all five migrations. The API E2E completed:

```text
admin draft -> role-1 publish rejected -> role-9 publish -> public list/detail
-> favorite twice with count 1 -> unfavorite twice with count 0 -> related ride
-> admin offline -> public HTTP 410/list hidden
```

The same flow verified that favorite counter writes do not change the route content `updated_at`, plus conditional publish/offline mutations, audit actions, and request IDs. A unit-level concurrent state-change case returned HTTP 409 semantics before audit append, preventing duplicate transition logs. With the route guard closed, `/api/v1/routes` returned 503 while the existing `/api/v1/rides` endpoint remained available.

## Recovery boundary

The S2 migration is additive. Application rollback keeps `route.enabled=false` and rolls application code back; route data is retained for later recovery or inspection. Dropping S2 tables is not an automatic rollback step. Production migration still requires an approved backup and restore rehearsal on a current production copy.
