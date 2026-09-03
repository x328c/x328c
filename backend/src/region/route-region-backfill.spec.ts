import { BackfillPoint, BackfillRoute, planRouteRegionBackfill } from './route-region-backfill';
import { options, validateCheckpoint, writePlan } from '../../scripts/backfill-v23-route-regions';

const start: BackfillPoint = {
  id: 10n,
  order: 0,
  type: 'start',
  name: '公共起点',
  latitude: 43.8,
  longitude: 87.6,
  province_code: '650000',
  city_code: '650100',
  district_code: null,
};
const route = (points: BackfillPoint[] = [start]): BackfillRoute => ({
  id: 1n,
  city_code: '650100',
  district_code: null,
  start_location: '公共起点',
  start_lat: 43.8,
  start_lng: 87.6,
  end_location: null,
  end_lat: null,
  end_lng: null,
  points,
  regions: [],
  waypoints: [],
});

describe('controlled region backfill', () => {
  it('binds resume checkpoints to the exact database, catalog, mode and schema', () => {
    const expected = {
      schema: 2,
      catalog: '2025-12-31',
      database: 'local-database-hash',
      mode: 'apply' as const,
      completed: {},
    };
    expect(
      validateCheckpoint({ ...expected, completed: { 'user:1': 'a'.repeat(64) } }, expected)
        .completed,
    ).toEqual({ 'user:1': 'a'.repeat(64) });
    for (const patch of [
      { schema: 1 },
      { catalog: 'old' },
      { database: 'another-database' },
      { mode: 'preview' as const },
      { completed: { 'user:1': 'broken' } },
    ]) {
      expect(() => validateCheckpoint({ ...expected, ...patch }, expected)).toThrow(
        'checkpoint_mismatch',
      );
    }
  });
  it('requires the exact apply token and rejects misspelled arguments', () => {
    expect(options([]).apply).toBe(false);
    expect(options(['--apply', 'V23-BACKFILL']).apply).toBe(true);
    expect(() => options(['--apply', 'anything'])).toThrow('invalid_arguments');
    expect(() => options(['V23-BACKFILL'])).toThrow('invalid_arguments');
    expect(() => options(['--resume'])).toThrow('invalid_arguments');
  });

  it('deduplicates coverage without changing valid point IDs or primary codes', () => {
    const input = route([
      start,
      { ...start, id: 11n, order: 1, type: 'waypoint' },
      { ...start, id: 12n, order: 2, type: 'end', city_code: '652300' },
    ]);
    const plan = planRouteRegionBackfill('official', input);
    expect(plan.issues).toEqual([]);
    expect(plan.pointPatches).toEqual([]);
    expect(plan.primaryChanged).toBe(false);
    expect(plan.coverage).toEqual([
      {
        city_code: '650100',
        district_code: '',
        has_start: true,
        has_waypoint: true,
        point_count: 2,
      },
      {
        city_code: '652300',
        district_code: '',
        has_start: false,
        has_waypoint: true,
        point_count: 1,
      },
    ]);
    expect(planRouteRegionBackfill('official', { ...input, regions: plan.coverage }).changed).toBe(
      false,
    );
  });

  it('does not borrow the start city for a missing endpoint or silently omit malformed legacy waypoints', () => {
    const input = {
      ...route([]),
      end_location: '终点',
      end_lat: 44,
      end_lng: 85,
      waypoints: [null],
    };
    const plan = planRouteRegionBackfill('user', input);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        { code: 'invalid_waypoint', order: 1 },
        { code: 'missing_city', order: 1 },
      ]),
    );
    expect(plan.points.at(-1)?.city_code).toBeNull();
  });

  it.each([
    [{ city_code: null }, 'missing_city'],
    [{ city_code: '110100' }, 'unsupported_city'],
    [{ district_code: '652301' }, 'district_city_mismatch'],
    [{ province_code: '110000' }, 'unsupported_province'],
    [{ latitude: null }, 'invalid_coordinates'],
    [{ latitude: '' }, 'invalid_coordinates'],
    [{ longitude: 120 }, 'invalid_coordinates'],
  ])('blocks unsafe point attribution %p before any database writes', async (patch, code) => {
    const plan = planRouteRegionBackfill(
      'official',
      route([start, { ...start, id: 11n, type: 'waypoint', order: 1, ...patch }]),
    );
    expect(plan.issues).toContainEqual({ code, order: 1 });
    await expect(writePlan({} as never, 'official', 1n, plan)).rejects.toThrow(
      'unresolved_regions',
    );
  });

  it('only uses the existing main city as a start fallback and detects conflicting explicit codes', () => {
    const fallback = planRouteRegionBackfill(
      'official',
      route([{ ...start, city_code: null, province_code: null }]),
    );
    expect(fallback.issues).toEqual([]);
    expect(fallback.pointPatches).toEqual([
      { id: 10n, data: { province_code: '650000', city_code: '650100', district_code: null } },
    ]);
    expect(
      planRouteRegionBackfill('official', route([{ ...start, city_code: '652300' }])).issues,
    ).toContainEqual({ code: 'primary_city_conflict' });
  });

  it('retains structured points but blocks stale scalar snapshots for manual review', () => {
    const input = { ...route(), start_location: '旧起点' };
    expect(planRouteRegionBackfill('user', input).issues).toContainEqual({
      code: 'start_snapshot_conflict',
    });
    expect(
      planRouteRegionBackfill(
        'user',
        route([start, { ...start, id: 11n, order: 1, type: 'waypoint' }]),
      ).issues,
    ).toContainEqual({ code: 'waypoint_snapshot_conflict' });
  });

  it('patches existing points without deleting/recreating them or touching polylines', async () => {
    const input = route([{ ...start, province_code: null }]);
    const plan = planRouteRegionBackfill('user', input);
    const tx = {
      userRoutePoint: { update: jest.fn() },
      userRouteRegion: { deleteMany: jest.fn(), createMany: jest.fn() },
      userRoute: { update: jest.fn() },
    };
    await writePlan(tx as never, 'user', 1n, plan);
    expect(tx.userRoutePoint.update).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { province_code: '650000', city_code: '650100', district_code: null },
    });
    expect(tx.userRoute.update).not.toHaveBeenCalled();
    const stable = planRouteRegionBackfill('user', {
      ...input,
      points: [start],
      regions: plan.coverage,
    });
    expect(stable.changed).toBe(false);
  });

  it('fingerprints relevant edits but not timestamps or view counts', () => {
    const input = route();
    const first = planRouteRegionBackfill('user', input).fingerprint;
    expect(
      planRouteRegionBackfill('user', {
        ...input,
        view_count: 999,
        updated_at: new Date(),
      } as BackfillRoute).fingerprint,
    ).toBe(first);
    expect(
      planRouteRegionBackfill('user', { ...input, points: [{ ...start, name: '变更点位' }] })
        .fingerprint,
    ).not.toBe(first);
    expect(
      planRouteRegionBackfill('user', {
        ...input,
        regions: [
          {
            city_code: '650100',
            district_code: '',
            has_start: true,
            has_waypoint: false,
            point_count: 1,
          },
        ],
      }).fingerprint,
    ).not.toBe(first);
  });
});
