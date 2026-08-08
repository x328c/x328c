const SAFE_DATABASE_SUFFIXES = ['_test', '_ci'];

export function assertIsolatedTestDatabaseUrl(value: string | undefined): URL {
  if (!value) throw new Error('TEST_DATABASE_URL is required for database integration tests');
  const url = new URL(value);
  const database = url.pathname.replace(/^\//, '');
  const localHost = ['127.0.0.1', 'localhost', 'mysql'].includes(url.hostname);
  const safeName =
    SAFE_DATABASE_SUFFIXES.some((suffix) => database.endsWith(suffix)) ||
    database.startsWith('modazi_s1_');

  if (url.protocol !== 'mysql:' || !localHost || !safeName) {
    throw new Error(
      'Refusing database test outside an isolated local/CI database ending in _test or _ci',
    );
  }
  return url;
}
