import { normalizeExternalRouteUrl } from './external-route-link';

describe('normalizeExternalRouteUrl', () => {
  it('normalizes supported map links and removes fragments', () => {
    expect(normalizeExternalRouteUrl(' https://uri.amap.com/navigation?to=1,2#test ')).toEqual({
      external_route_url: 'https://uri.amap.com/navigation?to=1,2',
      external_route_provider: 'amap',
      external_url_status: 1,
    });
  });

  it.each([
    'http://maps.qq.com/route',
    'https://localhost/route',
    'https://127.0.0.1/route',
    'https://evil.example/route',
    'https://user:pass@maps.qq.com/route',
  ])('rejects unsafe link %s', (url) => {
    expect(() => normalizeExternalRouteUrl(url)).toThrow(/路线链接/);
  });
});
