import { Prisma } from '@prisma/client';
import { RouteListQueryDto } from './dto';

export function officialThroughQuery(
  query: RouteListQueryDto,
  cursor: { sortWeight: number; updatedAt: string; id: string } | undefined,
  take: number,
) {
  const after = cursor
    ? Prisma.sql`AND (
    r.sort_weight < ${cursor.sortWeight}
    OR (r.sort_weight = ${cursor.sortWeight} AND r.updated_at < ${new Date(cursor.updatedAt)})
    OR (r.sort_weight = ${cursor.sortWeight} AND r.updated_at = ${new Date(cursor.updatedAt)} AND r.id < ${BigInt(cursor.id)})
  )`
    : Prisma.empty;
  return Prisma.sql`SELECT DISTINCT r.id, r.sort_weight, r.updated_at
    FROM route_regions g STRAIGHT_JOIN routes r ON r.id = g.route_id
    WHERE g.city_code = ${query.city_code}
      ${query.district_code ? Prisma.sql`AND g.district_code = ${query.district_code}` : Prisma.empty}
      AND NOT (r.city_code <=> ${query.city_code} ${query.district_code ? Prisma.sql`AND r.district_code <=> ${query.district_code}` : Prisma.empty})
      AND r.status = 1 AND r.deleted_at IS NULL
      ${query.type ? Prisma.sql`AND r.type = ${query.type}` : Prisma.empty}
      ${query.difficulty ? Prisma.sql`AND r.difficulty = ${query.difficulty}` : Prisma.empty}
      ${after}
    ORDER BY r.sort_weight DESC, r.updated_at DESC, r.id DESC LIMIT ${take}`;
}
