import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RouteCacheService } from './route-cache.service';
import { RouteService } from './route.service';

describe('RouteService public contract', () => {
  const tx = {
    route: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    routeFavorite: { createMany: jest.fn(), deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const prisma = {
    route: { findMany: jest.fn(), findFirst: jest.fn() },
    routeFavorite: { findMany: jest.fn(), findUnique: jest.fn() },
    routeRideLink: { findMany: jest.fn() },
    ride: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const cache = {
    getList: jest.fn(),
    setList: jest.fn(),
    getDetail: jest.fn(),
    setDetail: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as RouteCacheService;
  const service = new RouteService(prisma, cache);
  const routeModel = (prisma as never as { route: { findMany: jest.Mock; findFirst: jest.Mock } })
    .route;

  beforeEach(() => {
    jest.clearAllMocks();
    (cache.getList as jest.Mock).mockResolvedValue(null);
    (cache.setList as jest.Mock).mockResolvedValue(undefined);
    (cache.invalidate as jest.Mock).mockResolvedValue(undefined);
    routeModel.findMany.mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockReset().mockResolvedValue([]);
  });

  it('never requests draft, offline or soft-deleted routes for the public list', async () => {
    await service.list({ limit: 20, city_code: '330100', type: 'scenic', difficulty: 'easy' });
    expect(routeModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 1,
          deleted_at: null,
          city_code: '330100',
          type: 'scenic',
          difficulty: 'easy',
        }),
        orderBy: [{ sort_weight: 'desc' }, { updated_at: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('rejects a malformed cursor before querying the database', async () => {
    await expect(service.list({ cursor: 'not-a-cursor' })).rejects.toMatchObject({ status: 400 });
    expect(routeModel.findMany).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3, 4, 5])(
    'keeps %i local starts before newer through routes across cursor pages',
    async (startCount) => {
      const makeRoute = (id: number, local: boolean) => ({
        id: BigInt(id),
        title: String(id),
        summary: null,
        cover_image: null,
        city_code: local ? '650100' : '652300',
        city_name: null,
        district_code: null,
        type: null,
        difficulty: null,
        distance_km: null,
        duration_min: null,
        favorite_count: 0,
        sort_weight: 1,
        updated_at: new Date('2026-09-03T00:00:00Z'),
        regions: [{ city_code: '650100', district_code: '', has_start: local }],
      });
      const starts = Array.from({ length: startCount }, (_, i) => makeRoute(20 - i, true));
      const through = [makeRoute(100, false), makeRoute(99, false), makeRoute(98, false)];
      (prisma.$queryRaw as jest.Mock).mockImplementation(async (query: Prisma.Sql) => {
        const cursorId = query.values.find((value) => typeof value === 'bigint') as
          bigint | undefined;
        return through
          .filter((row) => cursorId === undefined || row.id < cursorId)
          .slice(0, Number(query.values.at(-1)));
      });
      routeModel.findMany.mockImplementation(async ({ where, take }) => {
        const after = where.AND?.find((part: { OR?: Array<{ id?: { lt: bigint } }> }) =>
          part.OR?.some((clause) => clause.id?.lt !== undefined),
        );
        const cursorId = after?.OR.at(-1)?.id.lt;
        const isThrough = JSON.stringify(where, (_, value) =>
          typeof value === 'bigint' ? String(value) : value,
        ).includes('regions');
        const rows = isThrough ? through : starts;
        return rows.filter((row) => cursorId === undefined || row.id < cursorId).slice(0, take);
      });
      const ids: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await service.list({ city_code: '650100', limit: 2, cursor });
        ids.push(...result.items.map((item) => item.id));
        if (!result.hasMore) break;
        expect(result.nextCursor).not.toBeNull();
        cursor = result.nextCursor!;
      }
      expect(ids).toEqual([...starts, ...through].map((row) => String(row.id)));
      expect(routeModel.findMany.mock.calls.every(([args]) => args.take <= 3)).toBe(true);
      expect(cache.getList).toHaveBeenCalledWith(expect.objectContaining({ ordering_version: 2 }));
    },
  );

  it('retains coverage matches with an unknown primary district', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 10n }]);
    await service.list({ city_code: '650100', district_code: '650102', region_scope: 'through' });
    expect(routeModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { regions: { some: { city_code: '650100', district_code: '650102' } } },
            {
              OR: [
                { city_code: { not: '650100' } },
                { city_code: null },
                { district_code: { not: '650102' } },
                { district_code: null },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('rejects an unknown cursor partition', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        sortWeight: 0,
        updatedAt: new Date().toISOString(),
        id: '1',
        phase: 'unknown',
      }),
    ).toString('base64url');
    await expect(service.list({ cursor })).rejects.toMatchObject({ status: 400 });
    expect(routeModel.findMany).not.toHaveBeenCalled();
  });

  it('does not increment the derived count for a duplicate favorite', async () => {
    tx.route.findFirst.mockResolvedValue({ id: 7n });
    tx.routeFavorite.createMany.mockResolvedValue({ count: 0 });
    tx.route.findUniqueOrThrow.mockResolvedValue({ favorite_count: 4 });

    await expect(service.favorite(2n, 7n)).resolves.toEqual({ favorited: true, favorite_count: 4 });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith(7n);
  });

  it('updates a newly-created favorite count atomically without changing content ordering time', async () => {
    tx.route.findFirst.mockResolvedValue({ id: 7n });
    tx.routeFavorite.createMany.mockResolvedValue({ count: 1 });
    tx.$executeRaw.mockResolvedValue(1);
    tx.route.findUniqueOrThrow.mockResolvedValue({ favorite_count: 5 });

    await expect(service.favorite(2n, 7n)).resolves.toEqual({ favorited: true, favorite_count: 5 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('revalidates cached detail state and reports an offline route explicitly', async () => {
    (cache.getDetail as jest.Mock).mockResolvedValue({
      id: '7',
      updated_at: new Date(0).toISOString(),
    });
    routeModel.findMany.mockResolvedValue([]);
    routeModel.findFirst.mockResolvedValue({ id: 7n, status: 2, deleted_at: null });

    await expect(service.detail(7n)).rejects.toMatchObject({ status: 410 });
  });

  it('applies the current V1 visibility, audit and soft-delete rules to related rides', async () => {
    routeModel.findFirst.mockResolvedValue({ city_code: '330100' });
    const routeRideLink = (prisma as never as { routeRideLink: { findMany: jest.Mock } })
      .routeRideLink;
    const ride = (prisma as never as { ride: { findMany: jest.Mock } }).ride;
    routeRideLink.findMany.mockResolvedValue([]);
    ride.findMany.mockResolvedValue([]);

    await expect(service.relatedRides(7n)).resolves.toEqual({ items: [] });
    expect(routeRideLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          route_id: 7n,
          ride: {
            status: { in: [1, 2, 3] },
            audit_status: 1,
            deleted_at: null,
            user: { status: 1, deleted_at: null },
          },
        },
      }),
    );
    expect(ride.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ city_code: '330100', deleted_at: null, audit_status: 1 }),
        take: 3,
      }),
    );
  });

  it('encodes a stable composite cursor without serializing BigInt directly', async () => {
    routeModel.findMany.mockResolvedValue([
      {
        id: 9n,
        title: 'A',
        summary: null,
        cover_image: null,
        city_code: '330100',
        city_name: '杭州',
        type: 'scenic',
        difficulty: 'easy',
        distance_km: new Prisma.Decimal(10),
        duration_min: 60,
        favorite_count: 0,
        sort_weight: 5,
        updated_at: new Date('2026-07-31T00:00:00Z'),
      },
      {
        id: 8n,
        title: 'B',
        summary: null,
        cover_image: null,
        city_code: '330100',
        city_name: '杭州',
        type: 'scenic',
        difficulty: 'easy',
        distance_km: new Prisma.Decimal(8),
        duration_min: 50,
        favorite_count: 0,
        sort_weight: 4,
        updated_at: new Date('2026-07-30T00:00:00Z'),
      },
    ]);

    const result = await service.list({ limit: 1 });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString())).toEqual({
      sortWeight: 5,
      updatedAt: '2026-07-31T00:00:00.000Z',
      id: '9',
    });
  });
});
