import { Prisma } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { FEATURE_FLAG_METADATA } from '../common/feature-flag/feature-flag.decorator';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminRouteController } from './admin-route.controller';
import { AdminRouteService } from './admin-route.service';
import { RouteCacheService } from './route-cache.service';

const baseRoute = {
  id: 7n,
  title: '乌鲁木齐环线',
  summary: '精选路线',
  cover_image: 'https://example.com/cover.jpg',
  images: [],
  city_code: '650100',
  district_code: null,
  city_name: '乌鲁木齐市',
  type: 'scenic',
  difficulty: 'easy',
  distance_km: new Prisma.Decimal(25),
  duration_min: 90,
  polyline: [
    { latitude: 43.8, longitude: 87.6 },
    { latitude: 44.1, longitude: 87.3 },
  ],
  road_condition: '铺装路面',
  suitable_motorcycles: '不限',
  best_season: '春秋',
  safety_notice: '弯道减速',
  status: 0,
  sort_weight: 10,
  maintainer_id: 9n,
  favorite_count: 0,
  published_at: null,
  offlined_at: null,
  offline_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  maintainer: { id: 9n, username: 'root' },
  points: [
    {
      id: 1n,
      route_id: 7n,
      order: 0,
      name: '起点',
      latitude: new Prisma.Decimal(43.8),
      longitude: new Prisma.Decimal(87.6),
      province_code: '650000', city_code: '650100', district_code: null,
      type: 'start',
      description: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 2n,
      route_id: 7n,
      order: 1,
      name: '终点',
      latitude: new Prisma.Decimal(44.1),
      longitude: new Prisma.Decimal(87.3),
      province_code: '650000', city_code: '652300', district_code: null,
      type: 'end',
      description: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ],
  ride_links: [],
};

describe('AdminRouteService governance', () => {
  const tx = {
    route: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    routeRegion: { deleteMany: jest.fn(), createMany: jest.fn() },
    operationLog: { create: jest.fn() },
  };
  const prisma = {
    route: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const operationLogs = { appendWithClient: jest.fn() } as unknown as OperationLogService;
  const cache = { invalidate: jest.fn() } as unknown as RouteCacheService;
  const service = new AdminRouteService(prisma, operationLogs, cache);
  const routeModel = (prisma as never as { route: { findFirst: jest.Mock } }).route;
  const actor = { adminId: 9n, requestId: 'req-route-1', ipAddress: '127.0.0.1' };

  beforeEach(() => jest.clearAllMocks());

  it('requires all publication fields and endpoints', async () => {
    routeModel.findFirst.mockResolvedValue({ ...baseRoute, cover_image: null });
    await expect(service.publish(7n, actor)).rejects.toThrow(/cover_image/);
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });

  it('publishes and appends the audit record in the same transaction', async () => {
    const published = { ...baseRoute, status: 1, published_at: new Date() };
    routeModel.findFirst.mockResolvedValueOnce(baseRoute).mockResolvedValueOnce(published);
    tx.route.updateMany.mockResolvedValue({ count: 1 });
    tx.route.findUniqueOrThrow.mockResolvedValue(published);
    (operationLogs.appendWithClient as jest.Mock).mockResolvedValue({ id: '1' });
    (cache.invalidate as jest.Mock).mockResolvedValue(undefined);

    await expect(service.publish(7n, actor)).resolves.toMatchObject({ id: '7', status: 1 });
    expect(tx.routeRegion.createMany).toHaveBeenCalledWith({ data: [
      { route_id: 7n, city_code: '650100', district_code: '', has_start: true, has_waypoint: false, point_count: 1 },
      { route_id: 7n, city_code: '652300', district_code: '', has_start: false, has_waypoint: true, point_count: 1 },
    ] });
    expect(operationLogs.appendWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'route.publish',
        objectType: 'route',
        objectId: '7',
        requestId: 'req-route-1',
      }),
    );
  });

  it('rejects a concurrent publication state change without writing a duplicate audit log', async () => {
    routeModel.findFirst.mockResolvedValue(baseRoute);
    tx.route.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.publish(7n, actor)).rejects.toMatchObject({ status: 409 });
    expect(operationLogs.appendWithClient).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it('marks publish as super-admin only and binds the route feature flag', () => {
    const publish = Object.getOwnPropertyDescriptor(
      AdminRouteController.prototype,
      'publish',
    )?.value;
    expect(Reflect.getMetadata(ROLES_KEY, publish)).toEqual([9]);
    expect(Reflect.getMetadata(FEATURE_FLAG_METADATA, AdminRouteController)).toBe('route.enabled');
  });

  it('rejects top-level city changes without changing the saved start point', async () => {
    routeModel.findFirst.mockResolvedValue(baseRoute);
    await expect(service.update(7n, { city_code: '652300' }, actor)).rejects.toThrow(/地图点位/);
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });

  it('rejects top-level district changes without changing the saved start point', async () => {
    routeModel.findFirst.mockResolvedValue(baseRoute);
    await expect(service.update(7n, { district_code: '650102' }, actor)).rejects.toThrow(/地图点位/);
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });

  it('does not publish legacy points missing city attribution', async () => {
    routeModel.findFirst.mockResolvedValue({ ...baseRoute, points: baseRoute.points.map((point) => ({ ...point, city_code: null })) });
    await expect(service.publish(7n, actor)).rejects.toMatchObject({ response: { code: 51122 } });
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });

  it('does not publish when main city conflicts with the actual start', async () => {
    routeModel.findFirst.mockResolvedValue({ ...baseRoute, city_code: '652300' });
    await expect(service.publish(7n, actor)).rejects.toThrow(/主地区与起点不一致/);
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });

  it('does not publish unsupported cities even when no RegionService was injected', async () => {
    routeModel.findFirst.mockResolvedValue({ ...baseRoute, points: baseRoute.points.map((point) => ({ ...point, city_code: '330100' })) });
    await expect(service.publish(7n, actor)).rejects.toMatchObject({ response: { code: 51120 } });
    expect(tx.route.updateMany).not.toHaveBeenCalled();
  });

  it('rechecks point regions from the locked publication record before audit and coverage', async () => {
    routeModel.findFirst.mockResolvedValue(baseRoute);
    tx.route.updateMany.mockResolvedValue({ count: 1 });
    tx.route.findUniqueOrThrow.mockResolvedValue({ ...baseRoute, status: 1, points: baseRoute.points.map((point) => ({ ...point, city_code: null })) });
    await expect(service.publish(7n, actor)).rejects.toMatchObject({ response: { code: 51122 } });
    expect(tx.routeRegion.createMany).not.toHaveBeenCalled();
    expect(operationLogs.appendWithClient).not.toHaveBeenCalled();
  });
});
