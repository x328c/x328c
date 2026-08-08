# Backend test isolation

- Unit tests mock Prisma and Redis and must not require `.env` or external services.
- Test-local Nest controllers are allowed only inside `*.integration-spec.ts`; they are never imported by `AppModule`, so no test endpoint is exposed by a production build.
- Any database integration test must use `TEST_DATABASE_URL` and call `assertIsolatedTestDatabaseUrl` before constructing Prisma. Accepted databases are local/CI MySQL databases ending in `_test` or `_ci`, plus disposable `modazi_s1_*` rehearsal databases.
- Never alias `TEST_DATABASE_URL` to a production/staging URL. CI uses its dedicated `modazi_ci` service database.
- Migration rehearsals use a newly created disposable MySQL container and explicit database names; they do not read repository `.env` files.
