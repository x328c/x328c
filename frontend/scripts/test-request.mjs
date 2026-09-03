import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import axios from 'axios';
import { resolveBuildTarget } from './weapp-build-target.mjs';

function load(relative, dependencies) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
    return dependencies[name];
  } }, { filename });
  return exports;
}
const network = load('../src/utils/request-network.ts', {});
const plain = (value) => JSON.parse(JSON.stringify(value));
function setup(respond) {
  const calls = [];
  const actions = { refresh: 0, redirect: 0, cleared: 0 };
  const state = {
    accessToken: 'old-access', refreshToken: 'refresh', user: { id: '1' },
    hydrate() {},
    setSession(access, refresh, user) { this.accessToken = access; this.refreshToken = refresh; this.user = user; },
    clearSession() { actions.cleared++; },
  };
  const store = { getState: () => state };
  const taro = { request: async (config) => {
    calls.push(config);
    const result = await respond(config, actions);
    return { header: {}, ...result };
  }, login: async () => ({ code: 'single-use-test-code' }) };
  const api = load('../src/services/request.ts', {
    axios: { __esModule: true, default: axios, AxiosError: axios.AxiosError },
    '@tarojs/taro': { __esModule: true, default: taro }, '@/config': { API_BASE: 'https://api.example.test/api/v1' },
    '@/stores/user-store': { useUserStore: store }, '@/utils/request-network': network,
    '@/utils/login-return': { currentPageUrl: () => '/pages/routes/index', openLogin: async () => { actions.redirect++; } },
  });
  const auth = load('../src/services/auth.ts', {
    '@tarojs/taro': { __esModule: true, default: taro }, '@/config': { API_BASE: 'https://api.example.test/api/v1' },
    '@/stores/user-store': { useUserStore: store }, '@/stores/notification-store': {}, './request': api,
  });
  return { ...api, auth, calls, actions, state };
}
const ok = (data) => ({ statusCode: 200, data: { code: 0, data } });

test('device build uses the local LAN backend and production still rejects local targets', () => {
  assert.deepEqual(resolveBuildTarget('device', undefined, 'TARO_APP_API_BASE="http://192.168.1.153:3000/api/v1"'), {
    TARO_APP_API_BASE: 'http://192.168.1.153:3000/api/v1', TARO_APP_ENV: 'development',
  });
  assert.deepEqual(resolveBuildTarget('development'), {});
  assert.throws(() => resolveBuildTarget('device'), /缺少/);
  for (const base of ['http://api.example.test', 'https://127.0.0.1', 'https://localhost', 'https://a.localhost', 'https://192.168.1.1', 'https://[::1]', 'https://user:password@example.test', 'https://api.example.test?token=secret'])
    assert.throws(() => resolveBuildTarget('production', base), base);
  for (const base of ['http://127.0.0.1:3000/api/v1', 'https://jiangxingjc.cn/api/v1', 'http://8.8.8.8:3000', 'http://169.254.1.1:3000', 'http://172.32.0.1:3000'])
    assert.throws(() => resolveBuildTarget('device', base), base);
  for (const base of ['http://10.0.0.1:3000/api/v1', 'http://172.16.0.1:3000/api/v1'])
    assert.equal(resolveBuildTarget('device', base).TARO_APP_API_BASE, base);
});

test('network messages distinguish loopback, domain, TLS and timeout without leaking raw details', () => {
  assert.match(network.networkFailureMessage({}, 'http://127.0.0.1:3000/api/v1'), /真机/);
  assert.equal(network.isLoopbackApi('https://127.0.0.1.evil.test'), false);
  for (const [message, expected] of [['request:fail url not in domain list', /合法域名/], ['SSL certificate error', /HTTPS证书/], ['request:fail timeout', /超时/]])
    assert.match(network.networkFailureMessage({ errMsg: message }, 'https://api.example.test'), expected);
  assert.equal(network.networkFailureMessage({ errMsg: 'secret-token private-address' }, 'https://api.example.test').includes('secret'), false);
});

test('request preserves endpoint, method, headers and query parameters', async () => {
  const api = setup(async () => ok({ list: [] }));
  assert.deepEqual(plain(await api.request({ url: '/user-routes/public', params: { city_code: '650100', absent: undefined }, headers: { 'X-Test': 'value' } })), { list: [] });
  assert.equal(api.calls[0].url, 'https://api.example.test/api/v1/user-routes/public');
  assert.equal(api.calls[0].method, 'GET');
  assert.deepEqual(plain(api.calls[0].data), { city_code: '650100' });
  assert.equal(api.calls[0].header.Authorization, 'Bearer old-access');
  assert.equal(api.calls[0].header['X-Test'], 'value');
});

test('login uses the unchanged payload and endpoint but never sends stale credentials', async () => {
  const api = setup(async () => ok({ access_token: 'new', refresh_token: 'new-refresh', user: { id: '2' }, is_new_user: true }));
  const consent = { bundle_version: 'test', user_agreement_hash: 'test-hash' };
  assert.equal((await api.auth.loginWithWechat(consent)).isNewUser, true);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, 'https://api.example.test/api/v1/auth/wx-login');
  assert.equal(api.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(api.calls[0].data), { code: 'single-use-test-code', legal_consent: consent });
  assert.equal(api.calls[0].header.Authorization, undefined);
  assert.equal(api.state.accessToken, 'new');
});

test('login rejection does not replay a single-use code or trigger refresh/redirect', async () => {
  const api = setup(async () => ({ statusCode: 401, data: { code: 41001, message: '微信凭证无效' } }));
  await assert.rejects(api.auth.loginWithWechat({}), (error) => error.code === 41001);
  assert.equal(api.calls.length, 1);
  assert.equal(api.actions.redirect, 0);
  assert.equal(api.actions.cleared, 0);
});

test('ordinary authenticated calls still refresh once and retry successfully', async () => {
  const api = setup(async (config, actions) => {
    if (config.url.endsWith('/auth/refresh-token')) {
      actions.refresh++;
      return ok({ access_token: 'fresh', refresh_token: 'fresh-refresh' });
    }
    return config.header.Authorization === 'Bearer fresh' ? ok({ id: '1' }) : { statusCode: 401, data: { code: 40101, message: 'expired' } };
  });
  assert.equal((await api.request({ url: '/users/profile' })).id, '1');
  assert.equal(api.actions.refresh, 1);
  assert.equal(api.actions.redirect, 0);
});

test('business errors preserve code, status and requestId rather than becoming network errors', async () => {
  const api = setup(async () => ({ statusCode: 400, data: { code: 51122, message: '请确认城市', requestId: 'request-test' } }));
  await assert.rejects(api.request({ url: '/rides', method: 'POST', data: { title: 'test' } }),
    (error) => error.code === 51122 && error.status === 400 && error.requestId === 'request-test');
  assert.equal(api.calls.length, 1);
});

test('failed POST is not retried and gets an actionable timeout message', async () => {
  const api = setup(async () => { throw { errMsg: 'request:fail timeout' }; });
  await assert.rejects(api.request({ url: '/rides', method: 'POST', data: {} }), /请求超时/);
  assert.equal(api.calls.length, 1);
});
