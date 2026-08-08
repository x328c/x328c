import { assertIsolatedTestDatabaseUrl } from './database-safety';

describe('test database isolation guard', () => {
  it.each([
    'mysql://test:test@127.0.0.1:3306/modazi_test',
    'mysql://ci:ci@mysql:3306/modazi_ci',
    'mysql://root:test@localhost:3306/modazi_s1_snapshot',
  ])('accepts an explicitly isolated database: %s', (url) => {
    expect(assertIsolatedTestDatabaseUrl(url).protocol).toBe('mysql:');
  });

  it.each([
    undefined,
    'mysql://root:secret@db.example.com:3306/modazi_prod',
    'mysql://root:secret@localhost:3306/modazi_prod',
  ])('rejects a missing or unsafe database: %s', (url) => {
    expect(() => assertIsolatedTestDatabaseUrl(url)).toThrow(/isolated|TEST_DATABASE_URL/);
  });
});
