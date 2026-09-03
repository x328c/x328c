import { Prisma } from '@prisma/client';
import { RegionService } from '../region/region.service';
import { UserRouteService } from './user-route.service';
import { CreateUserRouteDto } from './dto/user-route.dto';

describe('UserRoute point regions and coverage', () => {
  const endpoint = { name: '精河公共停车场', latitude: 44.60, longitude: 82.89, province_code: '650000', city_code: '652700', district_code: '652722' };
  const input = (): CreateUserRouteDto => ({
    title: '跨城路线', start_location: '乌鲁木齐站', start_lat: 43.87, start_lng: 87.48,
    city_code: '650100', district_code: '', visibility: 1, waypoints: [],
    end_location: endpoint.name, end_lat: endpoint.latitude, end_lng: endpoint.longitude, end_point: endpoint,
  });
  function setup() {
    const current = {
      id: 1n, user_id: 7n, title: '旧路线', visibility: 1, status: 1,
      start_location: '乌鲁木齐站', start_lat: new Prisma.Decimal(43.87), start_lng: new Prisma.Decimal(87.48),
      city_code: '650100', district_code: '650102', end_location: null, end_lat: null, end_lng: null,
      waypoints: [], points: [], images: [], user: { id: 7n, nickname: '测试骑友', avatar_url: null },
    };
    const tx = {
      userRoute: { create: jest.fn(async ({ data }) => ({ ...current, ...data })), update: jest.fn(async ({ data }) => ({ ...current, ...data })), findFirst: jest.fn(async () => current) },
      userRoutePoint: { deleteMany: jest.fn(), createMany: jest.fn() },
      userRouteRegion: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = { ...tx, $transaction: jest.fn(async (callback) => callback(tx)) };
    const service = new UserRouteService(prisma as never, undefined, undefined, new RegionService());
    return { service, tx };
  }
  it('stores endpoint city and creates unique start/through coverage without any map Key', async () => {
    const { service, tx } = setup();
    await service.create(7n, { ...input(), waypoints: [{ ...endpoint, name: '另一个精河点位' }] });
    const points = tx.userRoutePoint.createMany.mock.calls[0][0].data;
    expect(points.map((point: { city_code: string }) => point.city_code)).toEqual(['650100', '652700', '652700']);
    expect(tx.userRouteRegion.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ city_code: '650100', district_code: '', has_start: true, point_count: 1 }),
      expect.objectContaining({ city_code: '652700', district_code: '652722', has_waypoint: true, point_count: 2 }),
    ]);
  });
  it('replaces old coverage on edit and explicitly clears the old primary district', async () => {
    const { service, tx } = setup();
    await service.update(7n, 1n, input());
    expect(tx.userRoute.update.mock.calls[0][0].data.district_code).toBeNull();
    expect(tx.userRoutePoint.deleteMany).toHaveBeenCalledWith({ where: { user_route_id: 1n } });
    expect(tx.userRouteRegion.deleteMany).toHaveBeenCalledWith({ where: { user_route_id: 1n } });
    expect(tx.userRoutePoint.createMany.mock.calls[0][0].data).toContainEqual(expect.objectContaining({ type: 'end', city_code: '652700' }));
  });
  it('rejects a mismatched district and a legacy endpoint without confirmed city before transaction writes', async () => {
    const { service, tx } = setup();
    await expect(service.create(7n, { ...input(), end_point: { ...endpoint, district_code: '650102' } }))
      .rejects.toMatchObject({ response: { code: 51121 } });
    await expect(service.create(7n, { ...input(), end_point: undefined }))
      .rejects.toMatchObject({ response: { code: 55004 } });
    expect(tx.userRoute.create).not.toHaveBeenCalled();
  });
});
