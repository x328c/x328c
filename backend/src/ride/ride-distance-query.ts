import { Prisma } from '@prisma/client';
import { RideQueryDto } from './dto/ride-query.dto';

/** Parameterized MySQL queries; only ID/distance are sorted, before relation
 * hydration. Keep radius/order at the existing 0.01 km response precision. */
export function rideDistanceQueries(query: RideQueryDto) {
  const latitude = query.latitude!;
  const longitude = query.longitude!;
  const primary = query.city_code
    ? Prisma.sql`r.city_code = ${query.city_code}${query.district_code ? Prisma.sql` AND r.district_code = ${query.district_code}` : Prisma.empty}`
    : Prisma.sql`TRUE`;
  // Drive from the two indexed city sets. A correlated OR/EXISTS makes MySQL
  // scan every ride before calculating distances, even for a selected city.
  const from = query.city_code
    ? Prisma.sql`FROM (
    SELECT id FROM rides WHERE city_code = ${query.city_code}
      ${query.district_code ? Prisma.sql`AND district_code = ${query.district_code}` : Prisma.empty}
    UNION
    SELECT ride_id AS id FROM ride_points WHERE city_code = ${query.city_code}
      ${query.district_code ? Prisma.sql`AND district_code = ${query.district_code}` : Prisma.empty}
  ) AS candidates STRAIGHT_JOIN rides r ON r.id = candidates.id`
    : Prisma.sql`FROM rides r`;
  const distance =
    latitude !== undefined && longitude !== undefined
      ? Prisma.sql`ROUND(12742 * ASIN(SQRT(LEAST(1.0, GREATEST(0.0,
    POW(SIN(RADIANS(r.meetup_lat - ${latitude}) / 2), 2) +
    COS(RADIANS(${latitude})) * COS(RADIANS(r.meetup_lat)) *
    POW(SIN(RADIANS(r.meetup_lng - ${longitude}) / 2), 2)
  )))), 2)`
      : Prisma.sql`NULL`;
  const where = Prisma.sql`r.deleted_at IS NULL AND r.status IN (1, 2, 3)
    ${query.ride_style ? Prisma.sql`AND r.ride_style = ${query.ride_style}` : Prisma.empty}
    ${query.start_time ? Prisma.sql`AND r.departure_time >= ${new Date(query.start_time)}` : Prisma.empty}
    ${query.end_time ? Prisma.sql`AND r.departure_time <= ${new Date(query.end_time)}` : Prisma.empty}
    ${query.radius !== undefined ? Prisma.sql`AND ${distance} <= ${query.radius}` : Prisma.empty}`;
  const pageSize = query.pageSize ?? 20;
  const offset = ((query.page ?? 1) - 1) * pageSize;
  return {
    count: Prisma.sql`SELECT COUNT(*) AS total ${from} WHERE ${where}`,
    page: Prisma.sql`SELECT r.id, ${distance} AS distance_km,
      CASE WHEN ${primary} THEN 0 ELSE 1 END AS region_rank
      ${from} WHERE ${where}
      ORDER BY region_rank ASC, distance_km ASC, r.created_at DESC, r.id DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
  };
}
