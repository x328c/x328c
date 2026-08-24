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

  it('filters by meetup distance, sorts nearest first, then paginates', async () => {
    const prisma = {
      ride: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            record(3n, 44.02, 87.61, '2026-08-22T10:00:00Z'),
            record(2n, 43.85, 87.61, '2026-08-22T09:00:00Z'),
            record(1n, 43.83, 87.61, '2026-08-22T11:00:00Z'),
          ]),
      },
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
      expect.objectContaining({ orderBy: [{ created_at: 'desc' }, { id: 'desc' }] }),
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
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    } as unknown as PrismaService;
    const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);

    const result = await service.list({ city_code: '650100', page: 1, pageSize: 20 });

    expect(result.list.map((item) => item.id)).toEqual(['3', '2']);
    expect(prisma.ride.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ created_at: 'desc' }, { id: 'desc' }] }),
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
});
