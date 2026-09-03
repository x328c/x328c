import { createHash } from 'node:crypto';
import { MapProviderService } from './map-provider.service';

describe('MapProviderService', () => {
  const originalKey = process.env.TENCENT_MAP_ROUTE_KEY;
  const originalSecret = process.env.TENCENT_MAP_ROUTE_SECRET;
  const service = new MapProviderService();

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.TENCENT_MAP_ROUTE_KEY;
    else process.env.TENCENT_MAP_ROUTE_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.TENCENT_MAP_ROUTE_SECRET;
    else process.env.TENCENT_MAP_ROUTE_SECRET = originalSecret;
  });

  it('degrades without a configured key', async () => {
    delete process.env.TENCENT_MAP_ROUTE_KEY;
    await expect(
      service.planDrivingRoute([
        { latitude: 43, longitude: 87 },
        { latitude: 44, longitude: 88 },
      ]),
    ).resolves.toBeNull();
  });

  it('signs the independent driving-route request when a secret is configured', async () => {
    process.env.TENCENT_MAP_ROUTE_KEY = 'test-key';
    process.env.TENCENT_MAP_ROUTE_SECRET = 'test-secret';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 0, result: { routes: [{ polyline: [43, 87, 1000000, 1000000] }] } })),
    );

    await service.planDrivingRoute([
      { latitude: 43, longitude: 87 },
      { latitude: 44, longitude: 88 },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const signature = requestUrl.searchParams.get('sig');
    expect(signature).toMatch(/^[a-f0-9]{32}$/);
    expect(signature).toBe(
      createHash('md5')
        .update(
          '/ws/direction/v1/driving?from=43,87&key=test-key&to=44,88test-secret',
          'utf8',
        )
        .digest('hex'),
    );
    expect([...requestUrl.searchParams.keys()]).toEqual(['from', 'key', 'to', 'sig']);
  });

  it('decodes Tencent compressed driving polyline', async () => {
    process.env.TENCENT_MAP_ROUTE_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 0,
          result: { routes: [{ polyline: [43, 87, 1000000, 1000000] }] },
        }),
      ),
    );
    await expect(
      service.planDrivingRoute([
        { latitude: 43, longitude: 87 },
        { latitude: 44, longitude: 88 },
      ]),
    ).resolves.toEqual([
      { latitude: 43, longitude: 87 },
      { latitude: 44, longitude: 88 },
    ]);
  });
});
