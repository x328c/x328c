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
    'https://maps.example.com/route',
    'https://example.com/map/route',
    'https://example.com/route?source=map',
    'https://example.com/route?source=MAP',
  ])('accepts any safe HTTPS URL containing map: %s', (input) => {
    expect(normalizeExternalRouteUrl(input)).toMatchObject({
      external_url_status: 1,
    });
  });

  it.each([
    'http://maps.qq.com/route',
    'https://localhost/map/route',
    'https://127.0.0.1/map/route',
    'https://evil.example/route',
    'https://example.com/route#map-preview',
    'https://user:pass@maps.qq.com/route',
    'javascript:map()',
  ])('rejects unsafe link %s', (url) => {
    expect(() => normalizeExternalRouteUrl(url)).toThrow(/路线链接/);
  });

  it('keeps a normalized accepted URL valid when it is submitted again', () => {
    const first = normalizeExternalRouteUrl('https://example.com/MAP/route#preview');
    expect(first.external_route_url).toBe('https://example.com/MAP/route');
    expect(normalizeExternalRouteUrl(first.external_route_url)).toEqual(first);
  });
});
