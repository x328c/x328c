import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AdminRouteService } from '../src/route/admin-route.service';
import { assertIsolatedTestDatabaseUrl } from './database-safety';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('official route region integrity on isolated MySQL', () => {
  let prisma: PrismaClient;
  let adminId: bigint;
  const logs = { appendWithClient: jest.fn().mockResolvedValue(undefined) };
  const cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const api = () => new AdminRouteService(prisma as never, logs as never, cache as never);
  const actor = () => ({ adminId, requestId: 'isolated-region-test' });
  const input = () => ({
    title: '隔离官方跨城路线', cover_image: 'https://example.com/synthetic.jpg',
    city_code: '650100', district_code: '650102', city_name: '旧的名称',
    type: 'scenic' as const, difficulty: 'easy' as const, distance_km: 30, duration_min: 60,
    road_condition: '合成测试数据', safety_notice: '合成测试数据',
    polyline: [{ latitude: 44.1, longitude: 87.3 }, { latitude: 43.8, longitude: 87.6 }],
    points: [
      { order: 0, type: 'start' as const, name: '公共起点', latitude: 44.1, longitude: 87.3, city_code: '652300' },
      { order: 1, type: 'end' as const, name: '公共终点', latitude: 43.8, longitude: 87.6, city_code: '650100' },
    ],
  });
  const snapshot = (id: bigint) => prisma.route.findUniqueOrThrow({ where: { id }, include: {
    points: { orderBy: { order: 'asc' } }, regions: { orderBy: { city_code: 'asc' } },
  } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: assertIsolatedTestDatabaseUrl(databaseUrl).toString() } } });
    await prisma.$connect();
    adminId = (await prisma.adminUser.create({ data: {
      username: `reg-${randomUUID().slice(0, 20)}`, password_hash: 'isolated-only', role: 9,
    } })).id;
  });
  afterEach(async () => {
    if (adminId) await prisma.route.deleteMany({ where: { maintainer_id: adminId } });
    logs.appendWithClient.mockReset().mockResolvedValue(undefined);
  });
  afterAll(async () => {
    try { if (adminId) await prisma.adminUser.delete({ where: { id: adminId } }); }
    finally { await prisma?.$disconnect(); }
  });

  it('derives the city from start without inheriting a foreign district and rejects metadata-only relocation', async () => {
    const created = await api().create(input(), actor());
    const id = BigInt(created.id);
    expect(created.city_code).toBe('652300');
    expect(created.city_name).toBe('昌吉回族自治州');
    expect(created.district_code).toBe('');
    const before = await snapshot(id);
    expect(before.points[0].district_code).toBeNull();
    await expect(api().update(id, { city_code: '650100' }, actor())).rejects.toThrow(/地图点位/);
    expect(await snapshot(id)).toEqual(before);
  });

  it('rebuilds coverage from persisted points during publication and does not need a map key', async () => {
    const created = await api().create(input(), actor());
    const id = BigInt(created.id);
    await prisma.routeRegion.deleteMany({ where: { route_id: id } });
    expect((await api().publish(id, actor())).status).toBe(1);
    const saved = await snapshot(id);
    expect(saved.regions.map((region) => region.city_code)).toEqual(['650100', '652300']);
    expect(saved.regions.find((region) => region.city_code === '652300')?.has_start).toBe(true);
  });

  it('blocks legacy missing-city publication and rolls back coverage/status on audit failure', async () => {
    const created = await api().create(input(), actor());
    const id = BigInt(created.id);
    await prisma.routePoint.updateMany({ where: { route_id: id, type: 'end' }, data: { city_code: null } });
    await expect(api().publish(id, actor())).rejects.toMatchObject({ response: { code: 51122 } });
    expect((await snapshot(id)).status).toBe(0);
    await prisma.routePoint.updateMany({ where: { route_id: id, type: 'end' }, data: { city_code: '650100' } });
    await prisma.routeRegion.deleteMany({ where: { route_id: id } });
    const before = await snapshot(id);
    logs.appendWithClient.mockRejectedValueOnce(new Error('injected audit failure'));
    await expect(api().publish(id, actor())).rejects.toThrow('injected audit failure');
    expect(await snapshot(id)).toEqual(before);
  });
});
