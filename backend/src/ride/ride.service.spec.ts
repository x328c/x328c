import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RideService } from './ride.service';

describe('RideService creator transfer', () => {
  const tx = {
    ride: { findFirst: jest.fn(), update: jest.fn() },
    rideParticipant: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.ride.findFirst.mockResolvedValue({
      id: 11n,
      user_id: 1n,
      title: '周末同行',
      status: 1,
      departure_time: new Date(Date.now() + 86_400_000),
      deleted_at: null,
    });
    tx.rideParticipant.findUnique.mockResolvedValue({
      id: 22n,
      user_id: 2n,
      status: 1,
      deleted_at: null,
      user: { nickname: '新发起人' },
    });
  });

  it('atomically transfers ownership to an active participant', async () => {
    await expect(service.transferCreator(1n, 11n, 2n)).resolves.toEqual({
      success: true,
      creator_id: '2',
      creator_name: '新发起人',
    });
    expect(tx.rideParticipant.updateMany).toHaveBeenCalledWith({
      where: { ride_id: 11n, is_creator: true },
      data: { is_creator: false },
    });
    expect(tx.rideParticipant.update).toHaveBeenCalledWith({
      where: { id: 22n },
      data: { is_creator: true },
    });
    expect(tx.ride.update).toHaveBeenCalledWith({ where: { id: 11n }, data: { user_id: 2n } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});

describe('RideService manual finish', () => {
  const ride = {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  };
  const prisma = { ride } as unknown as PrismaService;
  const redis = { geoRemove: jest.fn() };
  const service = new RideService(prisma, redis as never, {} as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    ride.findFirst.mockResolvedValue({ id: 11n, user_id: 1n, status: 3, city_code: '650100' });
    ride.updateMany.mockResolvedValue({ count: 1 });
    redis.geoRemove.mockResolvedValue(undefined);
  });

  it('allows the creator to finish a running ride', async () => {
    await expect(service.finish(1n, 11n)).resolves.toEqual({ success: true });
    expect(ride.updateMany).toHaveBeenCalledWith({
      where: { id: 11n, user_id: 1n, status: 3, deleted_at: null },
      data: { status: 4 },
    });
    expect(redis.geoRemove).toHaveBeenCalledWith('geo:rides:650100', '11');
  });

  it('rejects a non-creator', async () => {
    await expect(service.finish(2n, 11n)).rejects.toMatchObject({ status: 403 });
    expect(ride.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a ride that is not running', async () => {
    ride.findFirst.mockResolvedValue({ id: 11n, user_id: 1n, status: 2, city_code: '650100' });
    await expect(service.finish(1n, 11n)).rejects.toMatchObject({ status: 400 });
    expect(ride.updateMany).not.toHaveBeenCalled();
  });
});

describe('RideService location list', () => {
  const record = (
    id: bigint,
    latitude: number,
    longitude: number,
    departure: string,
    createdAt = '2026-08-20T00:00:00Z',
  ) =>
    ({
      id,
      title: `同行${id.toString()}`,
      ride_style: 3,
      departure_time: new Date(departure),
      meetup_address: '测试集合点',
      meetup_lat: new Prisma.Decimal(latitude),
      meetup_lng: new Prisma.Decimal(longitude),
      destination: null,
      max_people: 10,
      join_count: 1,
      status: 1,
      city_code: '650100',
      view_count: 0,
      created_at: new Date(createdAt),
      user: {
        id,
        nickname: `用户${id.toString()}`,
        avatar_url: null,
        profile: null,
      },
      participants: [],
      route_links: [],
    }) as never;

  it('hydrates only the IDs on the SQL-ranked distance page', async () => {
    const prisma = {
      ride: {
        findMany: jest.fn().mockResolvedValue([record(2n, 43.85, 87.61, '2026-08-22T09:00:00Z')]),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ total: 2n }])
        .mockResolvedValueOnce([{ id: 2n, distance_km: 3.34 }]),
      $transaction: jest.fn(async (callback: (client: unknown) => unknown) => callback(prisma)),
    } as unknown as PrismaService;
    const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);

    const result = await service.list({
      city_code: '650100',
      latitude: 43.82,
      longitude: 87.61,
      radius: 10,
      page: 2,
      pageSize: 1,
    });

    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({ id: '2' });
    expect(result.pagination).toEqual({ page: 2, pageSize: 1, total: 2 });
    expect(prisma.ride.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [2n] } }, take: 1 }),
    );
  });

  it('uses newest publication order when location is unavailable', async () => {
    const prisma = {
      ride: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            record(3n, 43.83, 87.61, '2026-08-22T10:00:00Z', '2026-08-21T03:00:00Z'),
            record(2n, 43.85, 87.61, '2026-08-22T09:00:00Z', '2026-08-21T02:00:00Z'),
          ]),
        count: jest.fn().mockResolvedValue(2),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ total: 2n }])
        .mockResolvedValueOnce([
          { id: 3n, distance_km: null },
          { id: 2n, distance_km: null },
        ]),
      $transaction: jest.fn(async (callback: (client: unknown) => unknown) => callback(prisma)),
    } as unknown as PrismaService;
    const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);

    const result = await service.list({ city_code: '650100', page: 1, pageSize: 20 });

    expect(result.list.map((item) => item.id)).toEqual(['3', '2']);
    expect(prisma.ride.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [3n, 2n] } }, take: 20 }),
    );
  });

  it('rejects a distance filter without the current location', async () => {
    const prisma = { ride: { findMany: jest.fn() } } as unknown as PrismaService;
    const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);

    await expect(service.list({ city_code: '650100', radius: 5 })).rejects.toThrow(
      '距离筛选需要提供当前位置',
    );
    expect(prisma.ride.findMany).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3, 4, 5])(
    'paginates %i local meetups before newer through-city rides without loading all records',
    async (startCount) => {
      const starts = Array.from({ length: startCount }, (_, i) => ({
        ...(record(BigInt(20 - i), 43.83, 87.61, '2026-09-04T10:00:00Z') as object),
        points: [],
      }));
      const through = [100n, 99n, 98n].map((id) => ({
        ...(record(id, 44, 87, '2026-09-04T10:00:00Z') as object),
        city_code: '652300',
        points: [
          {
            id,
            city_code: '650100',
            latitude: new Prisma.Decimal(43.83),
            longitude: new Prisma.Decimal(87.61),
          },
        ],
      }));
      const all = [...starts, ...through] as unknown as Array<{ id: bigint }>;
      const ride = {
        findMany: jest.fn(async ({ where, take }) =>
          all.filter((row) => where.id.in.includes(row.id)).slice(0, take),
        ),
      };
      const prisma = {
        ride,
        $queryRaw: jest.fn(async (query: Prisma.Sql) => {
          if (query.sql.includes('COUNT(*)')) return [{ total: BigInt(all.length) }];
          const [take, skip] = query.values.slice(-2).map(Number);
          return all.slice(skip, skip + take).map(({ id }) => ({ id, distance_km: null }));
        }),
        $transaction: jest.fn(async (callback: (client: unknown) => unknown) => callback(prisma)),
      } as unknown as PrismaService;
      const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);
      const ids: string[] = [];
      for (let page = 1; page <= Math.ceil((startCount + through.length) / 2) + 1; page++) {
        const result = await service.list({ city_code: '650100', page, pageSize: 2 });
        expect(result.pagination.total).toBe(startCount + 3);
        ids.push(...result.list.map((item) => item.id));
      }
      expect(ids).toEqual([
        ...Array.from({ length: startCount }, (_, i) => String(20 - i)),
        '100',
        '99',
        '98',
      ]);
      expect(
        ride.findMany.mock.calls.every(
          ([args]) => args.take > 0 && args.take <= 2 && args.where.id.in.length <= 2,
        ),
      ).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
    },
  );
});
