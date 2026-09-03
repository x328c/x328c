import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/utils/route-feed.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported = {};
vm.runInNewContext(source, { exports: exported });
const { loadRouteFeedPage } = exported;
const query = { source: 'all', official: { city_code: '650100', type: 'scenic' }, user: { city_code: '650100', keyword: '测试' }, limit: 20 };

function fixture(sizes) {
  const calls = [];
  const data = Object.fromEntries(Object.entries(sizes).map(([key, size]) => [key, Array.from({ length: size }, (_, i) => ({ id: `${key}-${i}` }))]));
  const loaders = Object.fromEntries(['official', 'user'].map((name) => [name, async (params) => {
    calls.push({ name, ...params });
    const rows = data[`${params.region_scope}-${name}`] ?? [];
    const offset = params.cursor ? Number(params.cursor) : 0;
    const items = rows.slice(offset, offset + params.limit);
    const hasMore = offset + items.length < rows.length;
    return { items, hasMore, nextCursor: hasMore ? String(offset + items.length) : null };
  }]));
  return { calls, data, loaders };
}

test('all local starts precede through routes across sources and more than 50 records', async () => {
  const { data, calls, loaders } = fixture({ 'start-official': 23, 'start-user': 65, 'through-official': 3, 'through-user': 4 });
  const seen = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const result = await loadRouteFeedPage(query, loaders, cursor);
    assert.ok(result.items.length <= 20);
    seen.push(...result.items.map((item) => item.route.id));
    if (!result.continuation) break;
    cursor = result.continuation;
  }
  assert.deepEqual(seen, Object.values(data).flat().map((item) => item.id));
  assert.equal(new Set(seen).size, 95);
  assert.ok(calls.every((call) => call.limit <= 20 && call.city_code === '650100'));
  assert.ok(calls.filter((call) => call.name === 'official').every((call) => call.type === 'scenic'));
  assert.ok(calls.filter((call) => call.name === 'user').every((call) => call.keyword === '测试'));
});

test('skips empty groups and honors a single source filter', async () => {
  const { loaders, calls } = fixture({ 'through-user': 2 });
  const result = await loadRouteFeedPage({ ...query, source: 'user' }, loaders);
  assert.equal(result.items.length, 2);
  assert.equal(result.continuation, null);
  assert.ok(calls.every((call) => call.name === 'user'));
  assert.deepEqual(calls.map((call) => call.region_scope), ['start', 'through']);
});

test('does not mutate the incoming cursor after a partial-page failure, so retry loses no rows', async () => {
  const { loaders } = fixture({ 'start-official': 1, 'start-user': 2 });
  const cursor = { group: 0 };
  await assert.rejects(loadRouteFeedPage(query, { ...loaders, user: async () => { throw new Error('network'); } }, cursor), /network/);
  assert.deepEqual(cursor, { group: 0 });
  const retry = await loadRouteFeedPage(query, loaders, cursor);
  assert.equal(retry.items.length, 3);
});

test('rejects a non-progressing API cursor rather than looping forever', async () => {
  const loaders = { official: async () => ({ items: [{ id: '1' }], hasMore: true, nextCursor: 'same' }) };
  await assert.rejects(loadRouteFeedPage({ ...query, source: 'official' }, loaders, { group: 0, cursor: 'same' }), /分页异常/);
});

test('a new city or source starts with fresh cursors and an empty catalog terminates', async () => {
  const { loaders, calls } = fixture({});
  const result = await loadRouteFeedPage({ ...query, official: { city_code: '652300' }, user: { city_code: '652300' } }, loaders);
  assert.equal(result.items.length, 0);
  assert.equal(result.continuation, null);
  assert.ok(calls.every((call) => call.cursor === undefined && call.city_code === '652300'));
});
