import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual TypeScript implementation without loading the WeChat runtime.
function load(relativePath, dependencies = {}) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return exports;
}
const regions = load('../../backend/src/region/xinjiang-regions.ts');
const catalog = { province: regions.XINJIANG_PROVINCE, cities: regions.XINJIANG_CITIES, version: regions.XINJIANG_REGION_DATA_VERSION };
const coordinates = load('../src/utils/coordinates.ts');
function setup(result, supported = true, list = async () => catalog, showToast = async () => {}, trackRegionEvent = () => {}, calls = [], fallback = {}) {
  const taro = { showToast, showModal: fallback.showModal, canIUse: (api) => { assert.equal(api, 'chooseLocation'); return supported; }, chooseLocation: async (options) => {
    calls.push(options);
    if (result?.errMsg?.includes('fail')) throw result;
    return result;
  } };
  return load('../src/utils/poi-region.ts', {
    '@tarojs/taro': { __esModule: true, default: taro },
    '@/services/regions': { regionService: { list } },
    '@/utils/coordinates': coordinates,
    '@/services/region-analytics': { trackRegionEvent },
    '@/utils/map-coordinate-picker': { openCoordinatePicker: fallback.openCoordinatePicker },
  });
}
const sample = { type: 2, name: '公共集合点', address: '公共停车场', latitude: 43.8256, longitude: 87.6168, city: '乌鲁木齐市' };

test('all supported standard city names map to the backend catalog', () => {
  const { matchPoiCity } = setup();
  for (const city of catalog.cities) {
    assert.equal(matchPoiCity(city.name, catalog)?.code, city.code);
    assert.equal(matchPoiCity(`  新疆维吾尔自治区${city.name}  `, catalog)?.code, city.code);
  }
});
test('controlled aliases match; unknown or partial names are not guessed', () => {
  const { matchPoiCity } = setup();
  for (const [name, code] of Object.entries({ 乌市: '650100', 昌吉: '652300', 昌吉州: '652300', 博州: '652700', 巴州: '652800', 克州: '653000', 伊犁州: '654000', 石河子: '659001', 阿拉尔: '659002', 白杨: '659012' })) {
    assert.equal(matchPoiCity(name, catalog)?.code, code, name);
  }
  for (const name of ['', undefined, '乌鲁', '北京市', '某某市', '乌鲁木齐自治州', '乌鲁木齐地区', '乌鲁木齐新疆市']) assert.equal(matchPoiCity(name, catalog), undefined);
});
test('ambiguous aliases require confirmation; exact catalog names win', () => {
  const { matchPoiCity } = setup();
  const ambiguous = { ...catalog, cities: catalog.cities.map((city, index) => ({ ...city, aliases: index < 2 ? ['重名城市', '乌鲁木齐市'] : [] })) };
  assert.equal(matchPoiCity('重名城市', ambiguous), undefined);
  assert.equal(matchPoiCity('乌鲁木齐市', ambiguous)?.code, '650100');
});
test('native map selection preserves coordinates without trusting extra city fields', async () => {
  const { point } = await setup(sample).chooseMapRegionPoint(catalog);
  assert.equal(point.name, sample.name);
  assert.equal(point.latitude, sample.latitude);
  assert.equal(point.longitude, sample.longitude);
  assert.equal(point.city_code, undefined);
  assert.equal(point.district_code, undefined);
});
test('map result without city or type supports manual region confirmation', async () => {
  for (const city of ['', undefined, '无法识别的城市']) {
    const result = await setup({ ...sample, type: undefined, city }).chooseMapRegionPoint(catalog);
    assert.equal(result.point.city_code, undefined);
    assert.equal(result.point.latitude, sample.latitude);
  }
});
test('unnamed coordinates are accepted; missing or invalid coordinates are rejected', async () => {
  const blank = await setup({ ...sample, name: ' ', address: '' }).chooseMapRegionPoint(catalog);
  assert.equal(blank.point.name, '地图选点');
  assert.equal(blank.point.latitude, sample.latitude);
  const addressOnly = await setup({ ...sample, name: '', address: '塔城地区乌苏市Y096' }).chooseMapRegionPoint(catalog);
  assert.equal(addressOnly.point.name, '塔城地区乌苏市Y096');
  assert.equal(addressOnly.point.city_code, '654200');
  for (const result of [{ ...sample, latitude: undefined }])
    await assert.rejects(setup(result).chooseMapRegionPoint(catalog), /有效地点/);
  for (const latitude of [NaN, 91]) await assert.rejects(setup({ ...sample, latitude }).chooseMapRegionPoint(catalog), /坐标无效/);
  await assert.rejects(setup(sample, false).chooseMapRegionPoint(catalog), /升级微信/);
});
test('native cancel retains cancel reason for silent caller handling', async () => {
  await assert.rejects(setup({ errMsg: 'chooseLocation:fail cancel' }).chooseMapRegionPoint(catalog), /cancel/);
});
test('editing centers the map on the old point but never inherits its region', async () => {
  const calls = [];
  const initial = { ...sample, city_code: '650100', district_code: '650102' };
  const api = setup({ ...sample, latitude: 44.4, longitude: 84.9 }, true, undefined, undefined, undefined, calls);
  const result = await api.chooseMapRegionPoint(catalog, 'ride', initial);
  assert.equal(calls[0].latitude, initial.latitude);
  assert.equal(calls[0].longitude, initial.longitude);
  assert.equal(result.point.latitude, 44.4);
  assert.equal(result.point.city_code, undefined);
  assert.equal(initial.city_code, '650100');
  await api.chooseMapRegionPoint(catalog, 'ride', { ...initial, latitude: NaN });
  assert.equal(Object.keys(calls[1]).length, 0);
});
test('both editors auto-fill matched addresses and confirm unmatched points manually', () => {
  for (const file of ['../src/pages/rides/create/index.tsx', '../src/pages/routes/create/index.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /await chooseMapRegionPoint\(/);
    assert.match(source, /await openRegionConfirm\(kind, result.point\)/);
    assert.match(source, /if \(result.matchedRegion\) applyPoint\(kind, result.point\)/);
  }
  const config = readFileSync(new URL('../src/app.config.ts', import.meta.url), 'utf8');
  assert.match(config, /requiredPrivateInfos: \["getLocation", "chooseLocation"\]/);
});

test('addresses match prefectures or unique child regions, not embedded place names', () => {
  const { matchAddressRegion } = setup();
  const cases = [
    ['新疆维吾尔自治区克拉玛依市独山子区柳南路', '650200', '650202'],
    ['新疆维吾尔自治区塔城地区乌苏市Y096', '654200', '654202'],
    ['乌苏市Y096', '654200', '654202'],
    ['新疆维吾尔自治区乌鲁木齐市新市区北京北路', '650100', '650104'],
    ['中国 新疆维吾尔自治区 石河子市 北一路', '659001', undefined],
    ['伊犁哈萨克自治州伊宁市解放路', '654000', '654002'],
    ['昌吉市北京路', '652300', '652301'],
  ];
  for (const [address, city, district] of cases) {
    const result = matchAddressRegion(address, catalog);
    assert.equal(result?.city_code, city, address);
    assert.equal(result?.district_code, district);
  }
  for (const address of ['', undefined, '位置', 'Y096', '乌鲁木齐', '北京市乌鲁木齐市办事处',
    '乌鲁木齐市大厦', '塔城地区乌鲁木齐市', '克拉玛依市乌苏市Y096', '附近乌苏市公路', '新市区路1号'])
    assert.equal(matchAddressRegion(address, catalog), undefined, address);
  const ambiguous = { ...catalog, cities: catalog.cities.map(city => ({ ...city, districts: [...city.districts, { code: 'test', name: '同名县' }] })) };
  assert.equal(matchAddressRegion('同名县乡村路', ambiguous), undefined);
});

test('native failure offers explicit coordinate reselection; auth errors and cancel never fall back', async () => {
  let prompts = 0, opened = 0;
  const fallback = {
    showModal: async () => { prompts++; return { confirm: true }; },
    openCoordinatePicker: async () => { opened++; return { latitude: 44.6, longitude: 84.7, name: '', address: '' }; },
  };
  const point = await setup({ errMsg: 'chooseLocation:fail' }, true, undefined, undefined, undefined, [], fallback).chooseMapRegionPoint(catalog);
  assert.equal(point.point.latitude, 44.6);
  assert.equal(point.point.name, '地图选点');
  assert.equal(point.matchedRegion, undefined);
  assert.equal(opened, 1);
  for (const errMsg of ['chooseLocation:fail cancel', 'chooseLocation:fail auth deny', 'chooseLocation:fail api scope is not declared in the privacy agreement'])
    await assert.rejects(setup({ errMsg }, true, undefined, undefined, undefined, [], fallback).chooseMapRegionPoint(catalog));
  assert.equal(prompts, 1);
  await assert.rejects(setup({ errMsg: 'chooseLocation:fail' }, true, undefined, undefined, undefined, [], {
    ...fallback, showModal: async () => ({ confirm: false }),
  }).chooseMapRegionPoint(catalog), /cancel/);
  assert.equal(opened, 1);
});

test('coordinate picker channel resolves once, cancels on unload, and propagates navigation failure', async () => {
  let events;
  const api = load('../src/utils/map-coordinate-picker.ts', {
    '@tarojs/taro': { __esModule: true, default: { navigateTo: async options => { events = options.events; } } },
  });
  const selected = api.openCoordinatePicker();
  events.coordinateSelected(sample);
  events.coordinateCancelled();
  assert.equal((await selected).latitude, sample.latitude);
  const cancelled = api.openCoordinatePicker();
  events.coordinateCancelled();
  await assert.rejects(cancelled, /cancel/);
  const failed = load('../src/utils/map-coordinate-picker.ts', {
    '@tarojs/taro': { __esModule: true, default: { navigateTo: async () => { throw new Error('navigation failed'); } } },
  });
  await assert.rejects(failed.openCoordinatePicker(), /navigation failed/);
});

test('free map page saves the live map center, not the initial or nearby POI point', async () => {
  let onLoad, onUnload, centerReads = 0, back = 0;
  const events = [];
  const runtime = {
    getCurrentInstance: () => ({ page: { getOpenerEventChannel: () => ({ emit: (event, point) => events.push({ event, point }) }) } }),
    createMapContext: id => { assert.equal(id, 'coordinate-map'); return { getCenterLocation: async () => {
      centerReads++; return { latitude: 44.654321, longitude: 84.123456 };
    } }; },
    navigateBack: async () => { back++; }, showToast: async () => {},
  };
  const jsx = (type, props) => ({ type, props });
  const page = load('../src/pages/map/select/index.tsx', {
    '@tarojs/taro': { __esModule: true, default: runtime, useLoad: fn => { onLoad = fn; }, useUnload: fn => { onUnload = fn; } },
    'react': { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@tarojs/components': Object.fromEntries(['Button', 'CoverView', 'Input', 'Map', 'Text', 'View'].map(name => [name, name])),
    '@/utils/coordinates': coordinates, './index.scss': {},
  }).default();
  onLoad({ lat: '43.8', lng: '87.6' });
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === type && node.props.children === '使用地图中心点') return node;
    return [node.props?.children].flat().map(child => find(child, type)).find(Boolean);
  };
  const confirm = find(page, 'Button');
  assert.ok(confirm);
  confirm.props.onClick(); confirm.props.onClick();
  for (let n = 0; n < 6; n++) await Promise.resolve();
  assert.equal(centerReads, 1);
  assert.equal(back, 1);
  assert.equal(events[0].event, 'coordinateSelected');
  assert.equal(events[0].point.latitude, 44.654321);
  assert.equal(events[0].point.longitude, 84.123456);
  assert.equal(events[0].point.address, '');
  onUnload();
  assert.equal(events[1].event, 'coordinateCancelled');
});
test('manual city change clears old district and transport strips display-only names', () => {
  const { withRegion, toLocationInput, regionLabel } = setup();
  const point = withRegion({ ...sample, city_code: '650100', district_code: '650102', district_name: '天山区' }, {
    province_code: '650000', province_name: '新疆维吾尔自治区', city_code: '652300', city_name: '昌吉回族自治州',
  });
  assert.equal(point.district_code, undefined);
  assert.equal(point.district_name, undefined);
  const payload = toLocationInput(point);
  for (const field of ['city', 'type', 'city_name', 'province_name', 'district_name']) assert.equal(field in payload, false);
  assert.equal(regionLabel({ ...payload, city_name: undefined }, catalog), '昌吉回族自治州');
});

test('catalog failure is handled, preserves the saved point, and permits a fresh retry', async () => {
  let requests = 0;
  const toasts = [];
  const api = setup(undefined, true, async () => {
    if (++requests === 1) throw new Error('offline');
    return catalog;
  }, async (toast) => { toasts.push(toast.title); });
  const point = { ...sample, city_code: '652300' };
  const before = JSON.stringify(point);
  assert.equal(await api.prepareRegionConfirmation(point, '650100'), undefined);
  assert.deepEqual(toasts, ['地区目录加载失败，请重试']);
  assert.equal(JSON.stringify(point), before);
  assert.equal((await api.prepareRegionConfirmation(point, '650100')).cityCode, '652300');
  assert.equal(requests, 2);
});

test('manual candidates do not mutate unresolved points or carry foreign districts', async () => {
  const api = setup();
  const unresolved = { ...sample };
  const selection = await api.prepareRegionConfirmation(unresolved, '652300', catalog);
  assert.equal(selection.cityCode, '652300');
  assert.equal(unresolved.city_code, undefined);
  const stale = await api.prepareRegionConfirmation({ ...sample, city_code: '652300', district_code: '650102' }, '650100', catalog);
  assert.equal(stale.districtCode, undefined);
});

test('empty catalog cannot open confirmation or silently assign a city', async () => {
  let toastCount = 0;
  const api = setup(undefined, true, async () => catalog, async () => { toastCount++; });
  assert.equal(await api.prepareRegionConfirmation(sample, '650100', { ...catalog, cities: [] }), undefined);
  assert.equal(toastCount, 1);
});

test('invalid catalog responses are not cached and concurrent loads share a request', async () => {
  let requests = 0;
  const api = setup(undefined, true, async () => {
    requests++;
    return requests === 1 ? { ...catalog, cities: [] } : catalog;
  });
  const failed = await Promise.allSettled([api.loadRegionCatalog(), api.loadRegionCatalog()]);
  assert.equal(requests, 1);
  assert.equal(failed.every((result) => result.status === 'rejected'), true);
  const [first, second] = await Promise.all([api.loadRegionCatalog(), api.loadRegionCatalog()]);
  assert.equal(requests, 2);
  assert.equal(first, second);
});

test('map telemetry records selection and cancellation without claiming city detection', async () => {
  const events = [];
  const record = (name, properties) => events.push({ name, properties });
  await setup(sample, true, undefined, undefined, record).chooseMapRegionPoint(catalog, 'ride');
  await setup({ ...sample, city: '' }, true, undefined, undefined, record).chooseMapRegionPoint(catalog, 'user_route');
  await assert.rejects(setup({ errMsg: 'chooseLocation:fail cancel' }, true, undefined, undefined, record).chooseMapRegionPoint(catalog, 'ride'));
  assert.deepEqual(events.map((event) => event.name), ['poi_choose_success', 'poi_choose_success', 'poi_choose_failed']);
  assert.equal(events[0].properties.has_city, false);
  assert.equal(events[2].properties.reason, 'cancel');
  const serialized = JSON.stringify(events);
  for (const privateValue of [sample.name, sample.address, sample.latitude, sample.longitude, sample.city]) assert.equal(serialized.includes(String(privateValue)), false);
});

test('telemetry transport strips private data and skips authentication recovery', async () => {
  const calls = [];
  const analytics = load('../src/services/region-analytics.ts', {
    './request': { request: async (config) => { calls.push(config); throw new Error('offline'); } },
  });
  analytics.trackRegionEvent('poi_choose_success', {
    business: 'ride', type: 2, has_city: true,
    latitude: 43.8, address: 'private', name: 'private', city_code: 'private', reason: 'private', catalog_version: 'private',
  });
  analytics.trackRegionRejection({ code: 51122, message: 'private' }, 'ride', catalog.version);
  analytics.trackRegionRejection({ code: 500, message: 'private' }, 'ride');
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].skipAuthRefresh, true);
  assert.equal(calls[0].timeout, 3000);
  assert.equal(JSON.stringify(calls).includes('private'), false);
  assert.equal(calls[1].data.properties.error_code, 51122);
});

test('a synchronous telemetry transport error never escapes to the business caller', () => {
  const analytics = load('../src/services/region-analytics.ts', {
    './request': { request: () => { throw new Error('transport not ready'); } },
  });
  assert.doesNotThrow(() => analytics.trackRegionEvent('poi_choose_success', { business: 'ride', has_city: true }));
});
