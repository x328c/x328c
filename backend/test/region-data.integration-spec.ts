import { Prisma, PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertIsolatedTestDatabaseUrl } from './database-safety';
import { UserRouteService } from '../src/route/user-route.service';
import { RouteService } from '../src/route/route.service';
import { RideService } from '../src/ride/ride.service';
import { RegionService } from '../src/region/region.service';
import { planRouteRegionBackfill } from '../src/region/route-region-backfill';
import { writePlan } from '../scripts/backfill-v23-route-regions';

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseTests = databaseUrl ? describe : describe.skip;
const snapshotInclude = {
  points: { orderBy: { order: 'asc' as const } },
  regions: { orderBy: { city_code: 'asc' as const } },
};
const endpoint = {
  name: '精河公共停车场',
  latitude: 44.6,
  longitude: 82.89,
  province_code: '650000',
  city_code: '652700',
  district_code: '652722',
};
const start = {
  order: 0,
  type: 'start',
  name: '公共起点',
  latitude: 43.8,
  longitude: 87.6,
  province_code: '650000',
  city_code: '650100',
};

databaseTests('V2.3 region persistence on isolated MySQL', () => {
  let prisma: PrismaClient;
  let userId: bigint;
  let adminId: bigint;
  let safeUrl: string;
  const profiles = { assertProfileComplete: jest.fn() };
  const service = (client: unknown = prisma) =>
    new UserRouteService(client as never, profiles as never, undefined, new RegionService());
  const input = () => ({
    title: '跨城测试路线',
    start_location: '公共起点',
    start_lat: 43.8,
    start_lng: 87.6,
    city_code: '650100',
    district_code: '650102',
    visibility: 2 as const,
    waypoints: [],
    end_point: endpoint,
  });

  beforeAll(async () => {
    safeUrl = assertIsolatedTestDatabaseUrl(databaseUrl).toString();
    prisma = new PrismaClient({ datasources: { db: { url: safeUrl } } });
    await prisma.$connect();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    userId = (
      await prisma.user.create({
        data: { openid: `region-test-${suffix}`, nickname: '隔离地区测试用户' },
      })
    ).id;
    adminId = (
      await prisma.adminUser.create({
        data: { username: `region-test-${suffix}`, password_hash: 'isolated-test-only', role: 9 },
      })
    ).id;
  });
  afterEach(async () => {
    // Delete only this suite's own fixtures in the explicitly isolated database.
    if (userId) {
      await prisma.ride.deleteMany({ where: { user_id: userId } });
      await prisma.userRoute.deleteMany({ where: { user_id: userId } });
    }
    if (adminId) await prisma.route.deleteMany({ where: { maintainer_id: adminId } });
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (adminId) await prisma.adminUser.delete({ where: { id: adminId } });
    await prisma?.$disconnect();
  });

  it('persists cross-city points, replaces coverage after editing, and excludes private content', async () => {
    const api = service();
    const created = await api.create(userId, {
      ...input(),
      waypoints: [{ ...endpoint, name: '第二个精河点位' }],
    });
    const id = BigInt(created.id);
    const before = await prisma.userRoute.findUniqueOrThrow({
      where: { id },
      include: snapshotInclude,
    });
    expect(before.points.map((point) => point.city_code)).toEqual(['650100', '652700', '652700']);
    expect(before.regions.map((region) => [region.city_code, region.point_count])).toEqual([
      ['650100', 1],
      ['652700', 2],
    ]);
    expect((await api.publicList({ city_code: '652700' })).items.map((item) => item.id)).toContain(
      created.id,
    );
    await api.update(userId, id, {
      district_code: '',
      waypoints: [],
      end_point: {
        ...endpoint,
        name: '昌吉公共终点',
        city_code: '652300',
        district_code: '652301',
      },
    });
    const after = await prisma.userRoute.findUniqueOrThrow({
      where: { id },
      include: snapshotInclude,
    });
    expect(after.district_code).toBeNull();
    expect(after.regions.map((region) => region.city_code)).toEqual(['650100', '652300']);
    expect((await api.publicList({ city_code: '652700' })).items).toHaveLength(0);
    await api.update(userId, id, { visibility: 1 });
    expect((await api.publicList({ city_code: '652300' })).items).toHaveLength(0);
  });

  it('rolls back the route, deleted points and coverage when a late coverage write fails', async () => {
    const created = await service().create(userId, input());
    const id = BigInt(created.id);
    const before = await prisma.userRoute.findUniqueOrThrow({
      where: { id },
      include: snapshotInclude,
    });
    const failing = prisma.$extends({
      query: {
        userRouteRegion: {
          createMany() {
            throw new Error('injected-coverage-failure');
          },
        },
      },
    });
    await expect(
      service(failing).update(userId, id, { title: '不应落库的标题', district_code: '' }),
    ).rejects.toThrow('injected-coverage-failure');
    const after = await prisma.userRoute.findUniqueOrThrow({
      where: { id },
      include: snapshotInclude,
    });
    expect(after).toEqual(before);
  });

  it.each(['user', 'official'] as const)(
    'paginates %s routes with real SQL NULL/region predicates',
    async (kind) => {
      const expected: string[] = [];
      for (let index = 0; index < 6; index++) {
        const local = index < 3;
        const common = {
          title: `分页${index}`,
          city_code: local || index === 4 ? '650100' : index === 5 ? null : '652300',
          district_code: local ? '650102' : null,
          status: 1,
          regions: {
            create: [
              { city_code: '650100', district_code: '650102', has_start: local, point_count: 1 },
            ],
          },
        };
        const date = new Date(`2026-09-0${local ? 3 - index : 9 - index}T00:00:00Z`);
        const row =
          kind === 'user'
            ? await prisma.userRoute.create({
                data: {
                  ...common,
                  user_id: userId,
                  visibility: 2,
                  start_location: '公共起点',
                  start_lat: 43.8,
                  start_lng: 87.6,
                  created_at: date,
                },
              })
            : await prisma.route.create({
                data: {
                  ...common,
                  maintainer_id: adminId,
                  sort_weight: local ? 1 : 100,
                  updated_at: date,
                },
              });
        expected.push(row.id.toString());
      }
      const cache = { getList: jest.fn().mockResolvedValue(null), setList: jest.fn() };
      const api = kind === 'user' ? service() : new RouteService(prisma as never, cache as never);
      const ids: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const query = { city_code: '650100', district_code: '650102', limit: 2, cursor };
        const result =
          api instanceof UserRouteService ? await api.publicList(query) : await api.list(query);
        ids.push(...result.items.map((item) => item.id));
        if (!result.hasMore) break;
        cursor = result.nextCursor!;
      }
      expect(ids).toEqual(expected);
    },
  );

  it('paginates local meetups before newer through-city rides in MySQL', async () => {
    const expected: string[] = [];
    for (let index = 0; index < 5; index++) {
      const local = index < 3;
      const row = await prisma.ride.create({
        data: {
          user_id: userId,
          title: `同行${index}`,
          ride_style: 3,
          departure_time: new Date('2030-09-01T00:00:00Z'),
          meetup_address: '公共集合点',
          meetup_lat: 43.8,
          meetup_lng: 87.6,
          min_people: 2,
          max_people: 6,
          speed_level: 1,
          city_code: local ? '650100' : '652300',
          district_code: local ? '650102' : null,
          created_at: new Date(`2026-09-0${local ? 3 - index : 9 - index}T00:00:00Z`),
          points: {
            create: [
              {
                order: 0,
                type: 'waypoint',
                name: '公共途经点',
                latitude: 43.8,
                longitude: 87.6,
                city_code: '650100',
                district_code: '650102',
              },
            ],
          },
        },
      });
      expected.push(row.id.toString());
    }
    const api = new RideService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new RegionService(),
    );
    const ids: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const result = await api.list({
        city_code: '650100',
        district_code: '650102',
        page,
        pageSize: 2,
      });
      expect(result.pagination.total).toBe(5);
      ids.push(...result.list.map((item) => item.id));
    }
    expect(ids).toEqual(expected);
  });

  async function legacyRoute() {
    return prisma.userRoute.create({
      data: {
        user_id: userId,
        title: '待回填测试',
        start_location: '公共起点',
        start_lat: 43.8,
        start_lng: 87.6,
        city_code: '650100',
        visibility: 1,
        waypoints: [],
        polyline: [{ latitude: 43.8, longitude: 87.6 }],
        polyline_status: 1,
        points: { create: [{ ...start, province_code: null }] },
      },
      include: snapshotInclude,
    });
  }

  it('filters/sorts distance in SQL before hydrating a page and retains totals for an empty page', async () => {
    const ids: string[] = [];
    for (const [index, delta] of [0.03, 0.01, 0.02, 0, 0.5].entries()) {
      const row = await prisma.ride.create({
        data: {
          user_id: userId,
          title: `距离${index}`,
          ride_style: 3,
          departure_time: new Date('2030-09-01T00:00:00Z'),
          meetup_address: '公共集合点',
          meetup_lat: 43.8 + delta,
          meetup_lng: 87.6,
          min_people: 2,
          max_people: 6,
          speed_level: 1,
          city_code: '650100',
          district_code: index === 3 ? null : '650102',
          points: {
            create: [
              {
                order: 0,
                type: 'waypoint',
                name: '公共途经点',
                latitude: 43.8,
                longitude: 87.6,
                city_code: '650100',
                district_code: '650102',
              },
            ],
          },
        },
      });
      ids.push(row.id.toString());
    }
    const api = new RideService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new RegionService(),
    );
    const query = {
      city_code: '650100',
      district_code: '650102',
      latitude: 43.8,
      longitude: 87.6,
      radius: 10,
      ride_style: 3,
      start_time: '2030-08-01T00:00:00Z',
      end_time: '2030-10-01T00:00:00Z',
      pageSize: 2,
    };
    const first = await api.list({ ...query, page: 1 });
    const second = await api.list({ ...query, page: 2 });
    const empty = await api.list({ ...query, page: 3 });
    expect([...first.list, ...second.list].map((item) => item.id)).toEqual([
      ids[1],
      ids[2],
      ids[0],
      ids[3],
    ]);
    expect(first.list.map((item) => item.distance)).toEqual([1.11, 2.22]);
    expect(second.list.map((item) => item.region_match)).toEqual(['start', 'through']);
    expect(empty).toMatchObject({ list: [], pagination: { total: 4 } });
    expect((await api.list({ ...query, ride_style: 1 })).pagination.total).toBe(0);
    expect(
      (await api.list({ ...query, start_time: '2031-01-01T00:00:00Z' })).pagination.total,
    ).toBe(0);
    expect(
      (await api.list({ latitude: 43.8, longitude: 87.6, radius: 10, pageSize: 10 })).list[0].id,
    ).toBe(ids[3]);
  });

  it('applies only missing region data, preserves IDs/polyline, and becomes a no-op', async () => {
    const before = await legacyRoute();
    const plan = planRouteRegionBackfill('user', before);
    expect(plan.issues).toEqual([]);
    await prisma.$transaction((tx) => writePlan(tx, 'user', before.id, plan));
    const after = await prisma.userRoute.findUniqueOrThrow({
      where: { id: before.id },
      include: snapshotInclude,
    });
    expect(after.points.map((point) => point.id)).toEqual(before.points.map((point) => point.id));
    expect(after.polyline).toEqual(before.polyline);
    expect(planRouteRegionBackfill('user', after).changed).toBe(false);
  });

  it('rolls back backfill changes on a real transaction interruption', async () => {
    const before = await legacyRoute();
    const plan = planRouteRegionBackfill('user', before);
    await expect(
      prisma.$transaction(async (tx) => {
        await writePlan(tx, 'user', before.id, plan);
        throw new Error('injected-after-writes');
      }),
    ).rejects.toThrow('injected-after-writes');
    expect(
      await prisma.userRoute.findUniqueOrThrow({
        where: { id: before.id },
        include: snapshotInclude,
      }),
    ).toEqual(before);
  });

  it('runs the real CLI apply, resume and preview without touching another database', async () => {
    await legacyRoute();
    const run = (args: string[]) => {
      const output = execFileSync(
        process.execPath,
        [
          require.resolve('ts-node/dist/bin.js'),
          '--transpile-only',
          'scripts/backfill-v23-route-regions.ts',
          ...args,
        ],
        {
          cwd: resolve(__dirname, '..'),
          env: { ...process.env, DATABASE_URL: safeUrl },
          encoding: 'utf8',
          timeout: 20000,
        },
      );
      const directory = output.match(/Report directory: (.+)/)?.[1];
      expect(directory).toBeDefined();
      return {
        directory: directory!,
        summary: JSON.parse(readFileSync(join(directory!, 'summary.json'), 'utf8')),
      };
    };
    const applied = run(['--apply', 'V23-BACKFILL']);
    expect(applied.summary).toMatchObject({ examined: 1, applied: 1, blocked: 0, failed: 0 });
    const resumed = run(['--apply', 'V23-BACKFILL', '--resume', applied.directory]);
    expect(resumed.summary).toMatchObject({ resumed: 1, applied: 0, failed: 0 });
    const preview = run([]);
    expect(preview.summary).toMatchObject({ unchanged: 1, ready: 0, applied: 0, blocked: 0 });
  }, 60000);
});
