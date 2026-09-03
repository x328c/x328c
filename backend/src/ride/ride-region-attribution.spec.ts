import { Prisma } from '@prisma/client';
import { RegionService } from '../region/region.service';
import { RideService } from './ride.service';
import { CreateRideDto } from './dto';

describe('Ride city attribution without reverse geocoding', () => {
  const point = (city_code = '652300') => ({ name: '途经公共停车场', latitude: 44.01, longitude: 87.31, city_code, province_code: '650000' });
  const dto = (): CreateRideDto => ({
    title: '跨城测试', ride_style: 3, departure_time: new Date(Date.now() + 86_400_000).toISOString(),
    meetup_address: '乌鲁木齐公共停车场', meetup_lat: 43.82, meetup_lng: 87.61,
    city_code: '650100', min_people: 2, max_people: 6, speed_level: 1,
    waypoints: [point()], destination_point: { ...point('654000'), name: '伊犁终点', latitude: 43.91, longitude: 81.33 },
  });
  function setup() {
    const ride = { create: jest.fn(async ({ data }) => ({ id: 1n, ...data })), findUniqueOrThrow: jest.fn(async () => ({})) };
    const route = { findFirst: jest.fn(async () => ({
      id: 2n, title: '官方路线', city_code: '652300', district_code: null,
      polyline: [], external_route_url: null, distance_km: null, duration_min: null,
      points: [
        { ...point(), name: '官方起点', type: 'start' },
        { ...point('652700'), type: 'end', longitude: 82.0 },
      ],
    })) };
    const tx = { ride, route };
    const prisma = { ...tx, $transaction: jest.fn(async (callback) => callback(tx)) };
    const redis = { geoAdd: jest.fn() };
    const service = new RideService(prisma as never, redis as never,
      { assertEnabled: jest.fn() } as never, { verifyAndRecord: jest.fn() } as never,
      { assertProfileComplete: jest.fn() } as never, new RegionService());
    jest.spyOn(service as never, 'serializeRide').mockReturnValue({} as never);
    return { service, ride, route, redis };
  }
  it('writes manual meetup and every cross-city point and indexes the final city', async () => {
    const { service, ride, redis } = setup();
    await service.create(7n, dto());
    const data = ride.create.mock.calls[0][0].data;
    expect(data.city_code).toBe('650100');
    expect(data.points.create.map((entry: { city_code: string }) => entry.city_code)).toEqual(['652300', '654000']);
    expect(data.destination_city_code).toBe('654000');
    expect(redis.geoAdd).toHaveBeenCalledWith('geo:rides:650100', 87.61, 43.82, '1');
  });
  it('ignores forged client points and meetup when importing an uncustomized linked route', async () => {
    const { service, ride } = setup();
    await service.create(7n, { ...dto(), route_id: '2' });
    const data = ride.create.mock.calls[0][0].data;
    expect(data.city_code).toBe('652300');
    expect(data.meetup_address).toBe('官方起点');
    expect(data.points.create.map((entry: { city_code: string }) => entry.city_code)).toEqual(['652700']);
    expect(data.route_snapshot.customized).toBe(false);
  });
  it('validates and preserves user-customized points without retaining the old route polyline', async () => {
    const { service, ride } = setup();
    await service.create(7n, { ...dto(), route_id: '2', route_customized: true });
    const data = ride.create.mock.calls[0][0].data;
    expect(data.city_code).toBe('650100');
    expect(data.points.create.map((entry: { city_code: string }) => entry.city_code)).toEqual(['652300', '654000']);
    expect(data.route_snapshot.customized).toBe(true);
    expect(data.route_snapshot.polyline).toEqual([]);
    expect(data.route_customized).toBeUndefined();
    expect(data.meetup_lat).toEqual(new Prisma.Decimal(43.82));
  });
  it('rejects a missing point city before writing any ride', async () => {
    const { service, ride } = setup();
    await expect(service.create(7n, { ...dto(), waypoints: [{ ...point(), city_code: undefined }] }))
      .rejects.toMatchObject({ response: { code: 51122 } });
    expect(ride.create).not.toHaveBeenCalled();
  });
});
