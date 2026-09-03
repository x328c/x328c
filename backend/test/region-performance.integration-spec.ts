import { Prisma, PrismaClient } from '@prisma/client';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { assertIsolatedTestDatabaseUrl } from './database-safety';
import { RideService } from '../src/ride/ride.service';
import { RouteService } from '../src/route/route.service';
import { UserRouteService } from '../src/route/user-route.service';
import { RegionService } from '../src/region/region.service';

function database(url: string) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: [{ emit: 'event', level: 'query' }],
  });
}
const run = process.env.RUN_REGION_PERF === '1' ? describe : describe.skip;

function accessPaths(value: unknown): Array<{ table: string; access: string; key?: string }> {
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  const current =
    typeof item.table_name === 'string' && typeof item.access_type === 'string'
      ? [
          {
            table: item.table_name,
            access: item.access_type,
            key: typeof item.key === 'string' ? item.key : undefined,
          },
        ]
      : [];
  return [...current, ...Object.values(item).flatMap(accessPaths)];
}

run('V2.3 isolated region service performance', () => {
  let prisma: ReturnType<typeof database>;
  let userId: bigint;
  let adminId: bigint;
  let officialId: bigint;
  let userRouteId: bigint;
  let capture: Array<{ query: string; params: string }> | null = null;
  const cities = ['650100', '652300', '652700', '652800', '654000'];
  const district = (city: string) => (city === '650100' ? '650102' : null);
  const rideCount = 10000;
  const userRouteCount = 5000;
  const officialCount = 3000;

  beforeAll(async () => {
    const url = assertIsolatedTestDatabaseUrl(process.env.TEST_DATABASE_URL).toString();
    prisma = database(url);
    prisma.$on('query', (event) => {
      capture?.push({ query: event.query, params: event.params });
    });
    await prisma.$connect();
    const suffix = `${Date.now()}`;
    userId = (
      await prisma.user.create({
        data: { openid: `region-perf-${suffix}`, nickname: '隔离性能测试' },
      })
    ).id;
    adminId = (
      await prisma.adminUser.create({
        data: { username: `region-perf-${suffix}`, password_hash: 'isolated-test-only', role: 9 },
      })
    ).id;
    for (let offset = 0; offset < rideCount; offset += 500) {
      await prisma.ride.createMany({
        data: Array.from({ length: Math.min(500, rideCount - offset) }, (_, j) => {
          const i = offset + j;
          const city = cities[i % cities.length];
          return {
            user_id: userId,
            title: `性能同行${i}`,
            ride_style: 3,
            departure_time: new Date('2030-09-01T00:00:00Z'),
            meetup_address: '测试公共集合点',
            meetup_lat: 43.8 + (i % 100) / 1000,
            meetup_lng: 87.6 + (i % 71) / 1000,
            city_code: city,
            district_code: district(city),
            min_people: 2,
            max_people: 6,
            speed_level: 1,
          };
        }),
      });
    }
    const rides = await prisma.ride.findMany({
      where: { user_id: userId },
      select: { id: true, city_code: true },
      orderBy: { id: 'asc' },
    });
    for (let offset = 0; offset < rides.length; offset += 500) {
      await prisma.ridePoint.createMany({
        data: rides.slice(offset, offset + 500).map((ride) => ({
          ride_id: ride.id,
          order: 0,
          type: 'waypoint',
          name: '测试途经点',
          latitude: 43.8,
          longitude: 87.6,
          city_code:
            ride.city_code === '650100'
              ? '652300'
              : ride.city_code === '652300'
                ? '650100'
                : ride.city_code,
          district_code: ride.city_code === '652300' ? '650102' : null,
        })),
      });
    }
    for (let offset = 0; offset < userRouteCount; offset += 500) {
      await prisma.userRoute.createMany({
        data: Array.from({ length: Math.min(500, userRouteCount - offset) }, (_, j) => {
          const i = offset + j,
            city = cities[i % cities.length];
          return {
            user_id: userId,
            title: `性能骑友路线${i}`,
            start_location: '测试公共起点',
            start_lat: 43.8,
            start_lng: 87.6,
            city_code: city,
            district_code: district(city),
            visibility: 2,
          };
        }),
      });
    }
    for (let offset = 0; offset < officialCount; offset += 500) {
      await prisma.route.createMany({
        data: Array.from({ length: Math.min(500, officialCount - offset) }, (_, j) => {
          const i = offset + j,
            city = cities[i % cities.length];
          return {
            maintainer_id: adminId,
            title: `性能官方路线${i}`,
            city_code: city,
            district_code: district(city),
            status: 1,
            sort_weight: i % 10,
          };
        }),
      });
    }
    const users = await prisma.userRoute.findMany({
      where: { user_id: userId },
      select: { id: true, city_code: true },
    });
    const officials = await prisma.route.findMany({
      where: { maintainer_id: adminId },
      select: { id: true, city_code: true },
    });
    userRouteId = users[0].id;
    officialId = officials[0].id;
    const pointRows = (city: string | null) => [0, 1, 2].map((order) => ({
      order, type: order === 0 ? 'start' : order === 2 ? 'end' : 'waypoint', name: `测试公共点位${order}`,
      latitude: 43.8 + order / 100, longitude: 87.6, province_code: '650000',
      city_code: order === 0 ? city : '650100', district_code: order === 0 ? district(city ?? '') : '650102',
    }));
    for (let offset = 0; offset < users.length; offset += 250) await prisma.userRoutePoint.createMany({
      data: users.slice(offset, offset + 250).flatMap((row) => pointRows(row.city_code).map((point) => ({ user_route_id: row.id, ...point }))),
    });
    for (let offset = 0; offset < officials.length; offset += 250) await prisma.routePoint.createMany({
      data: officials.slice(offset, offset + 250).flatMap((row) => pointRows(row.city_code).map((point) => ({ route_id: row.id, ...point }))),
    });
    for (let offset = 0; offset < users.length; offset += 500)
      await prisma.userRouteRegion.createMany({
        data: users
          .slice(offset, offset + 500)
          .map((row) => ({
            user_route_id: row.id,
            city_code: '650100',
            district_code: '650102',
            has_start: row.city_code === '650100',
          })),
      });
    for (let offset = 0; offset < officials.length; offset += 500)
      await prisma.routeRegion.createMany({
        data: officials
          .slice(offset, offset + 500)
          .map((row) => ({
            route_id: row.id,
            city_code: '650100',
            district_code: '650102',
            has_start: row.city_code === '650100',
          })),
      });
  }, 120000);

  afterAll(async () => {
    if (userId) {
      await prisma.ride.deleteMany({ where: { user_id: userId } });
      await prisma.userRoute.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    if (adminId) {
      await prisma.route.deleteMany({ where: { maintainer_id: adminId } });
      await prisma.adminUser.delete({ where: { id: adminId } });
    }
    await prisma?.$disconnect();
  }, 120000);

  it('records explain plans and 200 warm samples per scenario at concurrency 5', async () => {
    const cache = {
      getList: jest.fn().mockResolvedValue(null),
      setList: jest.fn(),
      getDetail: jest.fn().mockResolvedValue(null),
      setDetail: jest.fn(),
    };
    const rides = new RideService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new RegionService(),
    );
    const users = new UserRouteService(prisma as never, undefined, undefined, new RegionService());
    const officials = new RouteService(prisma as never, cache as never);
    const region = { city_code: '650100', district_code: '650102' };
    const scenarios: Array<{ name: string; limitMs: number; operation: () => Promise<unknown> }> = [
      {
        name: 'ride_city_first',
        limitMs: 300,
        operation: () => rides.list({ ...region, page: 1, pageSize: 20 }),
      },
      {
        name: 'ride_city_through_page',
        limitMs: 300,
        operation: () => rides.list({ ...region, page: 110, pageSize: 20 }),
      },
      {
        name: 'ride_distance_radius',
        limitMs: 300,
        operation: () =>
          rides.list({
            ...region,
            latitude: 43.8,
            longitude: 87.6,
            radius: 10,
            page: 1,
            pageSize: 20,
          }),
      },
      {
        name: 'official_through',
        limitMs: 300,
        operation: () => officials.list({ ...region, region_scope: 'through', limit: 20 }),
      },
      {
        name: 'user_through_keyword',
        limitMs: 300,
        operation: () =>
          users.publicList({ ...region, region_scope: 'through', keyword: '性能', limit: 20 }),
      },
      {
        name: 'official_detail_no_cache',
        limitMs: 200,
        operation: () => officials.detail(officialId),
      },
      {
        name: 'user_detail_owner',
        limitMs: 200,
        operation: () => users.detail(userRouteId, userId),
      },
    ];
    const measured: Array<Record<string, unknown>> = [];
    for (const scenario of scenarios) {
      capture = [];
      await scenario.operation();
      const queries = capture;
      capture = null;
      const plans = [];
      for (const item of queries.filter(
        (item) =>
          /^SELECT/i.test(item.query) &&
          (/`(rides|routes|user_routes)`/.test(item.query) ||
            /(?:FROM|JOIN) (rides|routes|user_routes)\b/.test(item.query)),
      )) {
        // SQL is generated by the trusted ORM/our parameterized query builder,
        // not user text; values are bound separately, including for EXPLAIN.
        const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
          `EXPLAIN FORMAT=JSON ${item.query}`,
          ...JSON.parse(item.params),
        );
        plans.push({ sql: item.query, plan: JSON.parse(Object.values(rows[0])[0]) });
      }
      expect(plans.length).toBeGreaterThan(0);
      for (let i = 0; i < 5; i++) await scenario.operation();
      const timings: number[] = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: 5 }, async () => {
          while (next++ < 200) {
            const started = performance.now();
            await scenario.operation();
            timings.push(performance.now() - started);
          }
        }),
      );
      timings.sort((a, b) => a - b);
      const percentile = (p: number) => timings[Math.floor(timings.length * p)];
      measured.push({
        scenario: scenario.name,
        samples: timings.length,
        concurrency: 5,
        threshold_ms: scenario.limitMs,
        p50_ms: percentile(0.5),
        p95_ms: percentile(0.95),
        p99_ms: percentile(0.99),
        max_ms: timings.at(-1),
        plans,
        main_table_full_scans: plans
          .flatMap((item) => accessPaths(item.plan))
          .filter(
            (item) =>
              ['r', 'rides', 'routes', 'user_routes'].includes(item.table) && item.access === 'ALL',
          ),
      });
    }
    const root = resolve('logs/region-performance');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const directory = mkdtempSync(join(root, 'run-'));
    writeFileSync(
      join(directory, 'report.json'),
      JSON.stringify(
        {
          measured_at: new Date().toISOString(),
          boundary:
            'in-process Service + local MySQL connection; excludes HTTP, TLS, public network and Redis',
          data: {
            rides: rideCount,
            user_routes: userRouteCount,
            official_routes: officialCount,
            cities: 5,
            ride_points_per_ride: 1,
            route_points_per_route: 3,
            all_routes_cover_selected_city: true,
          },
          measured,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(`Region performance report: ${directory}`);
    console.table(measured.map(({ scenario, p99_ms, max_ms }) => ({ scenario, p99_ms, max_ms })));
    for (const result of measured) {
      expect(result.p99_ms).toBeLessThanOrEqual(Number(result.threshold_ms));
      expect(result.main_table_full_scans).toEqual([]);
    }
  }, 120000);
});
