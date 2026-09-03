import { createHash } from 'node:crypto';
import { RegionService } from './region.service';

type Coordinate = number | string | { toString(): string } | null;
export interface BackfillPoint {
  id?: bigint;
  order: number;
  type: string;
  name: string;
  address?: string | null;
  latitude: Coordinate;
  longitude: Coordinate;
  province_code?: string | null;
  city_code?: string | null;
  district_code?: string | null;
}
export interface Coverage {
  city_code: string;
  district_code: string;
  has_start: boolean;
  has_waypoint: boolean;
  point_count: number;
}
export interface BackfillRoute {
  id: bigint;
  city_code: string | null;
  district_code: string | null;
  points: BackfillPoint[];
  regions: Coverage[];
  start_location?: string;
  start_lat?: Coordinate;
  start_lng?: Coordinate;
  end_location?: string | null;
  end_lat?: Coordinate;
  end_lng?: Coordinate;
  waypoints?: unknown;
}
export type BackfillKind = 'official' | 'user';
export type BackfillIssue = { code: string; order?: number };
const directory = new RegionService();
const code = (value: string | null | undefined) => value || null;
const numeric = (value: Coordinate | undefined) =>
  value == null || String(value).trim() === '' ? NaN : Number(value);
const cleanCoverage = (rows: Coverage[]) =>
  rows
    .map((row) => ({
      city_code: row.city_code,
      district_code: row.district_code,
      has_start: row.has_start,
      has_waypoint: row.has_waypoint,
      point_count: row.point_count,
    }))
    .sort((a, b) =>
      `${a.city_code}:${a.district_code}`.localeCompare(`${b.city_code}:${b.district_code}`),
    );

/** Pure planning: no API lookup, no address guessing, and no partial coverage
 * rebuild for a resource whose point attribution cannot be established. */
export function planRouteRegionBackfill(kind: BackfillKind, route: BackfillRoute) {
  const issues: BackfillIssue[] = [];
  let sourcePoints = route.points;
  if (kind === 'user' && !sourcePoints.length) {
    sourcePoints = [
      {
        order: 0,
        type: 'start',
        name: route.start_location ?? '',
        latitude: route.start_lat ?? null,
        longitude: route.start_lng ?? null,
        city_code: route.city_code,
        district_code: route.district_code,
      },
    ];
    if (route.waypoints != null && !Array.isArray(route.waypoints))
      issues.push({ code: 'invalid_waypoints' });
    for (const [index, raw] of (Array.isArray(route.waypoints) ? route.waypoints : []).entries()) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        issues.push({ code: 'invalid_waypoint', order: index + 1 });
        continue;
      }
      const point = raw as Partial<BackfillPoint>;
      sourcePoints.push({
        order: index + 1,
        type: 'waypoint',
        name: point.name ?? '',
        address: point.address,
        latitude: point.latitude ?? null,
        longitude: point.longitude ?? null,
        province_code: point.province_code,
        city_code: point.city_code,
        district_code: point.district_code,
      });
    }
    if (route.end_location || route.end_lat != null || route.end_lng != null) {
      // Legacy scalar endpoints have no city field: never borrow the start city.
      sourcePoints.push({
        order: sourcePoints.length,
        type: 'end',
        name: route.end_location ?? '',
        latitude: route.end_lat ?? null,
        longitude: route.end_lng ?? null,
      });
    }
  }
  const points = sourcePoints.map((point) => {
    const city = code(point.city_code) ?? (point.type === 'start' ? route.city_code : null);
    const district =
      code(point.district_code) ??
      (point.type === 'start' && city === route.city_code ? code(route.district_code) : null);
    return {
      ...point,
      latitude: numeric(point.latitude),
      longitude: numeric(point.longitude),
      province_code: code(point.province_code) ?? '650000',
      city_code: city,
      district_code: district,
    };
  });
  if (points.filter((point) => point.type === 'start').length !== 1)
    issues.push({ code: 'requires_one_start' });
  if (points.filter((point) => point.type === 'end').length > 1)
    issues.push({ code: 'multiple_endpoints' });
  const orders = new Set<number>();
  for (const point of points) {
    if (!Number.isInteger(point.order) || point.order < 0 || orders.has(point.order))
      issues.push({ code: 'invalid_point_order', order: point.order });
    orders.add(point.order);
    if (!['start', 'waypoint', 'end'].includes(point.type))
      issues.push({ code: 'invalid_point_type', order: point.order });
    if (
      typeof point.name !== 'string' ||
      !point.name.trim() ||
      point.name.length > 80 ||
      (point.address != null && (typeof point.address !== 'string' || point.address.length > 300))
    )
      issues.push({ code: 'invalid_point_text', order: point.order });
    if (!point.city_code) issues.push({ code: 'missing_city', order: point.order });
    else if (!directory.isSupported(point.city_code))
      issues.push({ code: 'unsupported_city', order: point.order });
    else if (point.district_code && !directory.isSupported(point.city_code, point.district_code))
      issues.push({ code: 'district_city_mismatch', order: point.order });
    if (point.province_code !== '650000')
      issues.push({ code: 'unsupported_province', order: point.order });
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < 34 ||
      point.latitude > 50 ||
      point.longitude < 73 ||
      point.longitude > 97
    )
      issues.push({ code: 'invalid_coordinates', order: point.order });
  }
  const start = points.find((point) => point.type === 'start');
  const end = points.find((point) => point.type === 'end');
  if (start && points.some((point) => point.order < start.order))
    issues.push({ code: 'start_order_conflict' });
  if (end && points.some((point) => point.order > end.order))
    issues.push({ code: 'end_order_conflict' });
  if (start && route.city_code && route.city_code !== start.city_code)
    issues.push({ code: 'primary_city_conflict' });
  if (start && route.district_code && route.district_code !== start.district_code)
    issues.push({ code: 'primary_district_conflict' });
  if (kind === 'user' && route.points.length) {
    const savedWaypoints = points.filter((point) => point.type === 'waypoint');
    const legacyWaypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
    if (
      (route.waypoints != null && !Array.isArray(route.waypoints)) ||
      legacyWaypoints.length !== savedWaypoints.length ||
      savedWaypoints.some((point, index) => {
        const raw = legacyWaypoints[index];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
        const old = raw as Partial<BackfillPoint>;
        return (
          old.name !== point.name ||
          numeric(old.latitude) !== point.latitude ||
          numeric(old.longitude) !== point.longitude ||
          (Boolean(old.city_code) && old.city_code !== point.city_code) ||
          (Boolean(old.district_code) && old.district_code !== point.district_code)
        );
      })
    )
      issues.push({ code: 'waypoint_snapshot_conflict' });
    if (
      !start ||
      start.name !== route.start_location ||
      start.latitude !== numeric(route.start_lat) ||
      start.longitude !== numeric(route.start_lng)
    )
      issues.push({ code: 'start_snapshot_conflict' });
    const hasEnd = Boolean(route.end_location || route.end_lat != null || route.end_lng != null);
    if (
      hasEnd !== Boolean(end) ||
      (end &&
        (end.name !== route.end_location ||
          end.latitude !== numeric(route.end_lat) ||
          end.longitude !== numeric(route.end_lng)))
    )
      issues.push({ code: 'end_snapshot_conflict' });
  }
  const coverageMap = new Map<string, Coverage>();
  for (const point of points) {
    if (!point.city_code) continue;
    const district = point.district_code ?? '';
    const key = `${point.city_code}:${district}`;
    const previous = coverageMap.get(key);
    coverageMap.set(key, {
      city_code: point.city_code,
      district_code: district,
      has_start: Boolean(previous?.has_start || point.type === 'start'),
      has_waypoint: Boolean(previous?.has_waypoint || point.type !== 'start'),
      point_count: (previous?.point_count ?? 0) + 1,
    });
  }
  const coverage = cleanCoverage([...coverageMap.values()]);
  const primary = {
    city_code: start?.city_code ?? route.city_code,
    district_code: start?.district_code ?? null,
  };
  const createPoints = kind === 'user' && route.points.length === 0;
  const pointPatches = route.points.flatMap((point, index) => {
    const desired = points[index];
    const data = {
      province_code: desired.province_code,
      city_code: desired.city_code,
      district_code: desired.district_code,
    };
    return point.province_code !== data.province_code ||
      code(point.city_code) !== data.city_code ||
      code(point.district_code) !== data.district_code
      ? [{ id: point.id!, data }]
      : [];
  });
  const primaryChanged =
    route.city_code !== primary.city_code || route.district_code !== primary.district_code;
  const coverageChanged = JSON.stringify(cleanCoverage(route.regions)) !== JSON.stringify(coverage);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        {
          kind,
          id: route.id,
          city_code: route.city_code,
          district_code: route.district_code,
          start_location: route.start_location,
          start_lat: route.start_lat,
          start_lng: route.start_lng,
          end_location: route.end_location,
          end_lat: route.end_lat,
          end_lng: route.end_lng,
          waypoints: route.waypoints,
          points: route.points.map((point) => ({
            id: point.id?.toString(),
            order: point.order,
            type: point.type,
            name: point.name,
            address: point.address,
            latitude: String(point.latitude),
            longitude: String(point.longitude),
            province_code: point.province_code,
            city_code: point.city_code,
            district_code: point.district_code,
          })),
          regions: cleanCoverage(route.regions),
        },
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      ),
    )
    .digest('hex');
  return {
    issues,
    fingerprint,
    points,
    coverage,
    primary,
    createPoints,
    pointPatches,
    primaryChanged,
    coverageChanged,
    changed: createPoints || pointPatches.length > 0 || primaryChanged || coverageChanged,
  };
}
