# Backend test isolation

- Unit tests mock Prisma and Redis and must not require `.env` or external services.
- Test-local Nest controllers are allowed only inside `*.integration-spec.ts`; they are never imported by `AppModule`, so no test endpoint is exposed by a production build.
- Any database integration test must use `TEST_DATABASE_URL` and call `assertIsolatedTestDatabaseUrl` before constructing Prisma. Accepted databases are local/CI MySQL databases ending in `_test` or `_ci`, plus disposable `modazi_s1_*` rehearsal databases.
- Never alias `TEST_DATABASE_URL` to a production/staging URL. CI uses its dedicated `modazi_ci` service database.
- Migration rehearsals use a newly created disposable MySQL container and explicit database names; they do not read repository `.env` files.

## V2.3 region persistence regression

`admin-route-region.integration-spec.ts` verifies official-route start attribution, publication validation/coverage rebuilding and transaction rollback on the isolated database. It creates and cleans up only its own administrator and routes; it does not authorize repairing historical business records.

`region-telemetry.integration-spec.ts` uses the same isolated URL guard and tests actual JSON persistence, removal of user identity/private POI fields and event-ID deduplication. Cleanup deletes only its generated UUID event. It does not prove the HTTP auth/rate-limit chain or native device reporting.

`region-data.integration-spec.ts` requires an explicitly isolated `TEST_DATABASE_URL`. Run only after migrations have been applied to that test database:

```bash
npm run test:integration -- --runTestsByPath test/region-data.integration-spec.ts
```

It uses the real user-route, official-route and ride services, tests SQL NULL/cursor/offset/distance behavior, injects a late transaction failure, and invokes the real region backfill CLI (including apply/resume). CLI subprocesses receive the validated test URL explicitly. Fixture cleanup is scoped to the unique test user/admin; never substitute a business database URL. Reports under `logs/v23-region-backfill/` are private local artifacts, not source files.

Passing these tests is not evidence of WeChat device compatibility or production TP99 latency. Performance testing must report sample size, data distribution, concurrency, and measurement boundary separately.

## Opt-in region performance baseline

With `TEST_DATABASE_URL` pointing to a disposable, migrated MySQL database:

```bash
RUN_REGION_PERF=1 npm run test:integration -- --runTestsByPath test/region-performance.integration-spec.ts
```

The opt-in benchmark creates 10,000 rides, 5,000 user routes, 3,000 official routes, one point per ride and three points per route. It takes 200 warmed samples per scenario at concurrency 5, records generated-query EXPLAIN plans, and asserts list Service TP99 <=300ms, detail Service TP99 <=200ms and no `ALL` access on the main business tables in the captured regional scenarios. Scanning a materialized candidate set is not the same as scanning the main table. Cleanup targets only the benchmark's unique user/admin. JSON reports are written under `logs/region-performance/`.

This is an in-process Service + local MySQL baseline, not production HTTP/TLS/Redis/network performance, a cold-start benchmark, or a sustained load capacity test. Do not enable it against a shared business database or treat skipped opt-in tests as passing evidence.
