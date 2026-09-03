import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRouteService } from './user-route.service';

describe('UserRouteService visibility and publishing', () => {
  const prisma = {
    userRoute: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    userRoutePoint: { deleteMany: jest.fn(), createMany: jest.fn() },
    userRouteRegion: { deleteMany: jest.fn(), createMany: jest.fn() },
    fileRecord: { count: jest.fn() },
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(prisma)),
  } as unknown as PrismaService;
  const service = new UserRouteService(prisma);
  const record = {
    id: 7n,
    user_id: 1n,
    title: '公开路线',
    description: null,
    start_location: '公共停车场',
    start_lat: 30,
    start_lng: 120,
    end_location: null,
    end_lat: null,
    end_lng: null,
    waypoints: [],
    images: [],
    visibility: 2,
    view_count: 3,
    favorite_count: 0,
    status: 1,
    user: { id: 1n, nickname: '骑友', avatar_url: null },
  };

  beforeEach(() => jest.clearAllMocks());

  it('combines keyword and city constraints instead of replacing the city OR filter', async () => {
    (prisma.userRoute.findMany as jest.Mock).mockResolvedValue([]);
    await service.publicList({ city_code: '650100', keyword: '公共', limit: 20 });
    expect(prisma.userRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { city_code: '650100' },
            {
              OR: [
                { title: { contains: '公共' } },
                { start_location: { contains: '公共' } },
                { end_location: { contains: '公共' } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('does not disclose a private route to another user', async () => {
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue({ ...record, visibility: 1 });
    await expect(service.detail(7n, 2n)).rejects.toMatchObject({ status: 404 });
    expect(prisma.userRoute.update).not.toHaveBeenCalled();
  });

  it('carries the region phase and timestamp through public pagination, resetting the cursor between groups', async () => {
    const make = (id: bigint, day: number, local: boolean) => ({
      ...record,
      id,
      created_at: new Date(`2026-09-0${day}T00:00:00Z`),
      city_code: local ? '650100' : '652300',
      regions: [{ city_code: '650100', district_code: '', has_start: local }],
    });
    const starts = [make(5n, 3, true), make(6n, 2, true), make(4n, 1, true)];
    const through = [make(100n, 3, false), make(99n, 2, false)];
    const find = prisma.userRoute.findMany as jest.Mock;
    find.mockReset();
    find
      .mockResolvedValueOnce(starts)
      .mockResolvedValueOnce([starts[2]])
      .mockResolvedValueOnce(through)
      .mockResolvedValueOnce([through[1]]);
    const first = await service.publicList({ city_code: '650100', limit: 2 });
    const second = await service.publicList({
      city_code: '650100',
      limit: 2,
      cursor: first.nextCursor!,
    });
    const third = await service.publicList({
      city_code: '650100',
      limit: 2,
      cursor: second.nextCursor!,
    });
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual([
      '5',
      '6',
      '4',
      '100',
      '99',
    ]);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    expect(find.mock.calls[1][0].where.AND[1]).toEqual({
      OR: [
        { created_at: { lt: starts[1].created_at } },
        { created_at: starts[1].created_at, id: { lt: 6n } },
      ],
    });
    expect(find.mock.calls[2][0].where.AND).toHaveLength(1);
    expect(find.mock.calls[2][0].take).toBe(2);
    expect(find.mock.calls[3][0].where.AND[1].OR[1].id).toEqual({ lt: 100n });
  });

  it('rejects malformed public cursors before database access and accepts the legacy numeric form', async () => {
    const find = prisma.userRoute.findMany as jest.Mock;
    find.mockReset().mockResolvedValue([]);
    await expect(service.publicList({ cursor: 'rp1.invalid' })).rejects.toMatchObject({
      status: 400,
    });
    expect(find).not.toHaveBeenCalled();
    await service.publicList({ cursor: '7' });
    expect(find.mock.calls[0][0].where.AND).toContainEqual({ id: { lt: 7n } });
  });

  it('increments public views for a non-owner but not for the owner', async () => {
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue({ ...record });
    (prisma.userRoute.update as jest.Mock).mockResolvedValue(undefined);
    await expect(service.detail(7n, 2n)).resolves.toMatchObject({ view_count: 4 });
    expect(prisma.userRoute.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { view_count: { increment: 1 } },
    });

    jest.clearAllMocks();
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue({ ...record });
    await service.detail(7n, 1n);
    expect(prisma.userRoute.update).not.toHaveBeenCalled();
  });

  it('validates image ownership before publishing a public route', async () => {
    (prisma.fileRecord.count as jest.Mock).mockResolvedValue(1);
    (prisma.userRoute.create as jest.Mock).mockResolvedValue({
      ...record,
      images: ['https://cdn.example.com/a.jpg'],
    });
    await service.create(1n, {
      title: '公开路线',
      start_location: '公共停车场',
      start_lat: 30,
      start_lng: 120,
      city_code: '650100',
      images: ['https://cdn.example.com/a.jpg'],
      visibility: 2,
    });
    expect(prisma.fileRecord.count).toHaveBeenCalledWith({
      where: {
        user_id: 1n,
        cdn_url: { in: ['https://cdn.example.com/a.jpg'] },
        file_key: { startsWith: 'user-routes/' },
      },
    });
  });

  it('does not expose BigInt region coverage records in the public JSON response', async () => {
    (prisma.userRoute.findMany as jest.Mock).mockResolvedValue([
      {
        ...record,
        city_code: '650100',
        district_code: null,
        regions: [
          {
            id: 12n,
            user_route_id: 7n,
            city_code: '650100',
            district_code: '',
            has_start: true,
            has_waypoint: false,
            point_count: 1,
            created_at: new Date('2026-09-01T00:00:00Z'),
            updated_at: new Date('2026-09-01T00:00:00Z'),
          },
        ],
        favorites: [],
      },
    ]);

    const result = await service.publicList({ city_code: '650100', limit: 50 }, 1n);

    expect(result.items[0]).toMatchObject({ id: '7', region_match: 'start' });
    expect(result.items[0].regions).toBeUndefined();
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('updates a route with an omitted description when the stored description is null', async () => {
    const stored = {
      ...record,
      start_lat: new Prisma.Decimal(30),
      start_lng: new Prisma.Decimal(120),
      city_code: '650100',
      district_code: null,
      external_route_url: null,
      total_distance: null,
      estimated_time: null,
      difficulty: 3,
    };
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue(stored);
    (prisma.userRoute.update as jest.Mock).mockResolvedValue(record);

    await expect(
      service.update(1n, 7n, {
        title: '公开路线',
        start_location: '公共停车场',
        start_lat: 30,
        start_lng: 120,
        waypoints: [],
        city_code: '650100',
        images: [],
        visibility: 2,
      }),
    ).resolves.toMatchObject({ id: '7', title: '公开路线' });

    expect(prisma.userRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7n },
        data: expect.objectContaining({ title: '公开路线' }),
      }),
    );
  });
});
