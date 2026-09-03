import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(relative, dependencies) {
  const filename = new URL(relative, import.meta.url);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    assert.ok(name in dependencies, `unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function refreshSetup() {
  let session = { isLoggedIn: true, accessToken: 'test-session-a', user: { id: 'a' } };
  const counts = [], calls = [];
  const setUnreadCount = count => { counts.push(count); snapshot = { unreadCount: count, setUnreadCount }; };
  let snapshot = { unreadCount: 0, setUnreadCount };
  const api = load('../src/services/notification-refresh.ts', {
    '@/services/notifications': { notificationService: { unreadCount: () => {
      const call = deferred(); calls.push(call); return call.promise;
    } } },
    '@/stores/user-store': { useUserStore: { getState: () => session } },
    '@/stores/notification-store': { useNotificationStore: { getState: () => snapshot } },
  });
  return { ...api, counts, calls, setUnreadCount, getSession: () => session, changeSession: value => { session = value; } };
}

test('foreground refresh coalesces only in-flight calls and does not cache future visits', async () => {
  const api = refreshSetup();
  const a = api.refreshUnreadCount(), b = api.refreshUnreadCount();
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(api.calls.length, 1);
  api.calls[0].resolve({ count: 4 }); await a;
  assert.deepEqual(api.counts, [4]);
  const c = api.refreshUnreadCount(); await Promise.resolve();
  assert.equal(api.calls.length, 2);
  api.calls[1].resolve({ count: 5 }); await c;
  assert.deepEqual(api.counts, [4, 5]);
});
test('late startup count cannot undo read-all or another newer badge update', async () => {
  const api = refreshSetup();
  const pending = api.refreshUnreadCount(); await Promise.resolve();
  api.setUnreadCount(0);
  api.calls[0].resolve({ count: 9 }); await pending;
  assert.deepEqual(api.counts, [0]);
});
test('logout and account switch cannot receive a stale startup badge', async () => {
  const api = refreshSetup();
  const old = api.refreshUnreadCount(); await Promise.resolve();
  api.changeSession({ isLoggedIn: false, accessToken: null, user: null });
  await api.refreshUnreadCount();
  assert.equal(api.calls.length, 1);
  api.changeSession({ isLoggedIn: true, accessToken: 'test-session-b', user: { id: 'b' } });
  const next = api.refreshUnreadCount(); await Promise.resolve();
  api.calls[1].resolve({ count: 2 }); await next;
  api.calls[0].resolve({ count: 99 }); await old;
  assert.deepEqual(api.counts, [2]);
});
test('refresh errors and malformed counts do not update the badge and remain retryable', async () => {
  const api = refreshSetup();
  const first = api.refreshUnreadCount(); await Promise.resolve();
  api.calls[0].reject(new Error('offline')); await first;
  const next = api.refreshUnreadCount(); await Promise.resolve();
  api.calls[1].resolve({ count: NaN }); await next;
  assert.deepEqual(api.counts, []);
});
test('normal access-token renewal still applies the foreground response', async () => {
  const api = refreshSetup();
  const pending = api.refreshUnreadCount(); await Promise.resolve();
  api.changeSession({ ...api.getSession(), accessToken: 'renewed-test-token' });
  api.calls[0].resolve({ count: 6 }); await pending;
  assert.deepEqual(api.counts, [6]);
});

function uploadSetup({ size = 1024, fileError, imageType = 'png', imageError, cosError } = {}) {
  const requests = [], uploads = [], paths = [];
  const taro = {
    getFileSystemManager: () => ({ getFileInfo: options => {
      paths.push(options.filePath);
      // WeChat callback API returns void, not a promise.
      void Promise.resolve().then(() => fileError ? options.fail(fileError) : options.success({ size }));
    } }),
    getImageInfo: async () => { if (imageError) throw imageError; return { type: imageType }; },
  };
  const api = load('../src/utils/upload.ts', {
    '@tarojs/taro': { __esModule: true, default: taro },
    '@/config': { API_BASE: 'https://api.example.test/api/v1' },
    'cos-wx-sdk-v5': { __esModule: true, default: class {
      constructor(options) { assert.equal(options.SimpleUploadMethod, 'putObject'); }
      uploadFile(options, callback) { uploads.push(options); callback(cosError); }
    } },
    '@/services/request': { request: async config => {
      requests.push(config);
      return config.method === 'GET'
        ? { credentials: {}, bucket: 'test-bucket', region: 'test-region', file_key: 'test-key', file_url: 'https://files.example.test/a' }
        : { cdn_url: 'https://files.example.test/a' };
    } },
  });
  return { ...api, requests, uploads, paths };
}
test('all upload categories preserve signature, COS options, MIME and callback payload', async () => {
  for (const category of ['rides', 'avatars', 'route-comments', 'user-routes']) {
    const api = uploadSetup();
    assert.equal(await api.uploadImage('/tmp/test.png', 'image/jpeg', category), 'https://files.example.test/a');
    assert.deepEqual(api.paths, ['/tmp/test.png']);
    assert.deepEqual(plain(api.requests[0]), {
      method: 'GET', url: 'https://api.example.test/api/v1/files/upload-signature', params: { file_type: 'image/png', category },
    });
    assert.deepEqual(plain(api.uploads[0]), {
      Bucket: 'test-bucket', Region: 'test-region', Key: 'test-key', FilePath: '/tmp/test.png', ContentType: 'image/png',
    });
    assert.deepEqual(plain(api.requests[1]), {
      method: 'POST', url: 'https://api.example.test/api/v1/files/callback',
      data: { file_key: 'test-key', file_url: 'https://files.example.test/a', file_size: 1024, file_type: 'image/png' },
    });
  }
});
test('5MB boundary is unchanged; oversize and unreadable files never request upload credentials', async () => {
  await uploadSetup({ size: 5 * 1024 * 1024 }).uploadImage('/tmp/test.png');
  for (const options of [{ size: 5 * 1024 * 1024 + 1 }, { fileError: {} }, { size: NaN }, { size: -1 }]) {
    const api = uploadSetup(options);
    await assert.rejects(api.uploadImage('/tmp/test.png'));
    assert.equal(api.requests.length, 0);
    assert.equal(api.uploads.length, 0);
  }
});
test('image metadata fallback and COS failure behavior remain unchanged', async () => {
  const fallback = uploadSetup({ imageError: new Error('no metadata') });
  await fallback.uploadImage('/tmp/test.webp');
  assert.equal(fallback.uploads[0].ContentType, 'image/webp');
  const failed = uploadSetup({ cosError: { statusCode: 403 } });
  await assert.rejects(failed.uploadImage('/tmp/test.png'), /COS 拒绝上传/);
  assert.equal(failed.requests.length, 1);
  assert.equal(failed.uploads.length, 1);
});
