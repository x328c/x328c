import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RouteListQueryDto } from './dto';
import { ROUTE_LIMITS, ROUTE_STATUS } from './route.constants';
import { RouteCacheService } from './route-cache.service';
import { readRegionPage, RegionPhase } from '../region/region-pagination';
import { officialThroughQuery } from './route-through-query';

const publicRouteInclude = {
  points: { orderBy: { order: 'asc' as const } },
} satisfies Prisma.RouteInclude;

type PublicRouteRecord = Prisma.RouteGetPayload<{ include: typeof publicRouteInclude }>;
type RouteCursor = { sortWeight: number; updatedAt: string; id: string; phase?: RegionPhase };
type RouteListItem = ReturnType<RouteService['serializeSummary']>;
type CachedRouteList = { items: RouteListItem[]; nextCursor: string | null; hasMore: boolean };

@Injectable()
export class RouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RouteCacheService,
  ) {}

  async list(query: RouteListQueryDto, userId?: bigint) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const cacheInput = {
      ordering_version: 2,
      city_code: query.city_code ?? null,
      district_code: query.district_code ?? null,
      region_scope: query.region_scope ?? 'any',
      type: query.type ?? null,
      difficulty: query.difficulty ?? null,
      cursor: query.cursor ?? null,
      limit,
    };
    let result = await this.cache.getList<CachedRouteList>(cacheInput);
    if (result && !(await this.cacheIsCurrent(result.items))) result = null;

    if (!result) {
      const read = async (
        regionQuery: RouteListQueryDto,
        after: RouteCursor | undefined,
        take: number,
      ) => {
        const candidates =
          regionQuery.city_code && regionQuery.region_scope === 'through'
            ? await this.prisma.$queryRaw<Array<{ id: bigint }>>(
                officialThroughQuery(regionQuery, after, take),
              )
            : undefined;
        if (candidates && !candidates.length) return [];
        return this.prisma.route.findMany({
          where: {
            ...(candidates ? { id: { in: candidates.map((row) => row.id) } } : {}),
            status: ROUTE_STATUS.PUBLISHED,
            deleted_at: null,
            ...(after
              ? { AND: [this.regionWhere(regionQuery), this.cursorWhere(after)] }
              : this.regionWhere(regionQuery)),
            ...(regionQuery.type ? { type: regionQuery.type } : {}),
            ...(regionQuery.difficulty ? { difficulty: regionQuery.difficulty } : {}),
          },
          include: { regions: true },
          orderBy: [{ sort_weight: 'desc' }, { updated_at: 'desc' }, { id: 'desc' }],
          take,
        });
      };
      const partitioned = Boolean(
        query.city_code && (!query.region_scope || query.region_scope === 'any'),
      );
      const grouped = partitioned
        ? await readRegionPage({
            limit,
            phase: cursor?.phase,
            cursor,
            read: (phase, after, take) => read({ ...query, region_scope: phase }, after, take),
          })
        : undefined;
      const routes = grouped ? [] : await read(query, cursor, limit + 1);
      const hasMore = grouped ? grouped.hasMore : routes.length > limit;
      const page = grouped ? grouped.rows.map((row) => row.value) : routes.slice(0, limit);
      const last = page.at(-1);
      result = {
        items: page.map((route) => this.serializeSummary(route, query)),
        nextCursor:
          hasMore && last
            ? this.encodeCursor({
                sortWeight: last.sort_weight,
                updatedAt: last.updated_at.toISOString(),
                id: last.id.toString(),
                ...(grouped ? { phase: grouped.rows.at(-1)!.phase } : {}),
              })
            : null,
        hasMore,
      };
      await this.cache.setList(cacheInput, result);
    }

    return {
      ...result,
      items: await this.withFavoriteState(result.items, userId),
    };
  }

  async detail(id: bigint, userId?: bigint) {
    let serialized = await this.cache.getDetail<ReturnType<RouteService['serializeDetail']>>(id);
    if (serialized && !(await this.cacheIsCurrent([serialized]))) serialized = null;

    if (!serialized) {
      const route = await this.prisma.route.findFirst({
        where: { id, deleted_at: null },
        include: publicRouteInclude,
      });
      if (!route) throw new AppException(53002, '路线不存在', HttpStatus.NOT_FOUND);
      if (route.status === ROUTE_STATUS.OFFLINE) {
        throw new AppException(53004, '路线已下架', HttpStatus.GONE);
      }
      if (route.status !== ROUTE_STATUS.PUBLISHED) {
        throw new AppException(53002, '路线不存在', HttpStatus.NOT_FOUND);
      }
      serialized = this.serializeDetail(route);
      await this.cache.setDetail(id, serialized);
    }

    const isFavorited = userId
      ? Boolean(
          await this.prisma.routeFavorite.findUnique({
            where: { user_id_route_id: { user_id: userId, route_id: id } },
            select: { id: true },
          }),
        )
      : false;
    return { ...serialized, is_favorited: isFavorited };
  }

  async share(id: bigint) {
    const route = await this.detail(id);
    return {
      title: `${route.title}｜摩搭子路线`,
      path: `/packageRoutes/pages/detail/index?id=${route.id}`,
      imageUrl: route.cover_image ?? process.env.ROUTE_SHARE_IMAGE_URL ?? '',
    };
  }

  async favorite(userId: bigint, routeId: bigint) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const route = await tx.route.findFirst({
          where: { id: routeId, status: ROUTE_STATUS.PUBLISHED, deleted_at: null },
          select: { id: true },
        });
        if (!route) throw new AppException(53002, '路线不存在或不可收藏', HttpStatus.NOT_FOUND);
        const created = await tx.routeFavorite.createMany({
          data: [{ user_id: userId, route_id: routeId }],
          skipDuplicates: true,
        });
        if (created.count) {
          // 收藏计数是派生值；原子更新且不触发 Route.updated_at，避免普通收藏扰动内容游标排序。
          await tx.$executeRaw`UPDATE routes SET favorite_count = favorite_count + 1 WHERE id = ${routeId}`;
        }
        const current = await tx.route.findUniqueOrThrow({
          where: { id: routeId },
          select: { favorite_count: true },
        });
        return { favorited: true, favorite_count: current.favorite_count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.cache.invalidate(routeId);
    return result;
  }

  async unfavorite(userId: bigint, routeId: bigint) {
    const result = await this.prisma.$transaction(async (tx) => {
      const route = await tx.route.findFirst({
        where: { id: routeId, deleted_at: null },
        select: { id: true },
      });
      if (!route) throw new AppException(53002, '路线不存在', HttpStatus.NOT_FOUND);
      const removed = await tx.routeFavorite.deleteMany({
        where: { user_id: userId, route_id: routeId },
      });
      if (removed.count) {
        await tx.$executeRaw`UPDATE routes SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = ${routeId}`;
      }
      const current = await tx.route.findUniqueOrThrow({
        where: { id: routeId },
        select: { favorite_count: true },
      });
      return { favorited: false, favorite_count: current.favorite_count };
    });
    await this.cache.invalidate(routeId);
    return result;
  }

  async relatedRides(routeId: bigint) {
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, status: ROUTE_STATUS.PUBLISHED, deleted_at: null },
      select: { city_code: true },
    });
    if (!route) throw new AppException(53002, '路线不存在', HttpStatus.NOT_FOUND);

    const rideWhere: Prisma.RideWhereInput = {
      status: { in: [1, 2, 3] },
      audit_status: 1,
      deleted_at: null,
      user: { status: 1, deleted_at: null },
    };
    const explicit = await this.prisma.routeRideLink.findMany({
      where: { route_id: routeId, ride: rideWhere },
      select: { ride: { include: this.relatedRideInclude() } },
      orderBy: [{ ride: { departure_time: 'asc' } }, { ride_id: 'asc' }],
      take: ROUTE_LIMITS.relatedRideResults,
    });
    const rides = explicit.map((item) => item.ride);

    if (rides.length < ROUTE_LIMITS.relatedRideResults && route.city_code) {
      const cityRides = await this.prisma.ride.findMany({
        where: {
          ...rideWhere,
          city_code: route.city_code,
          id: { notIn: rides.map((ride) => ride.id) },
        },
        include: this.relatedRideInclude(),
        orderBy: [{ departure_time: 'asc' }, { id: 'asc' }],
        take: ROUTE_LIMITS.relatedRideResults - rides.length,
      });
      rides.push(...cityRides);
    }

    return { items: rides.map((ride) => this.serializeRelatedRide(ride)) };
  }

  private cursorWhere(cursor: RouteCursor): Prisma.RouteWhereInput {
    const updatedAt = new Date(cursor.updatedAt);
    const id = BigInt(cursor.id);
    return {
      OR: [
        { sort_weight: { lt: cursor.sortWeight } },
        { sort_weight: cursor.sortWeight, updated_at: { lt: updatedAt } },
        { sort_weight: cursor.sortWeight, updated_at: updatedAt, id: { lt: id } },
      ],
    };
  }

  private encodeCursor(cursor: RouteCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): RouteCursor {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as RouteCursor;
      if (
        !Number.isInteger(parsed.sortWeight) ||
        typeof parsed.updatedAt !== 'string' ||
        Number.isNaN(new Date(parsed.updatedAt).getTime()) ||
        typeof parsed.id !== 'string' ||
        !/^[1-9]\d*$/.test(parsed.id) ||
        (parsed.phase !== undefined && parsed.phase !== 'start' && parsed.phase !== 'through')
      ) {
        throw new Error('invalid cursor');
      }
      return parsed;
    } catch {
      throw new AppException(53001, '无效的分页游标');
    }
  }

  private async cacheIsCurrent(items: Array<{ id: string; updated_at: string }>): Promise<boolean> {
    if (!items.length) return true;
    try {
      const ids = items.map((item) => BigInt(item.id));
      const rows = await this.prisma.route.findMany({
        where: { id: { in: ids }, status: ROUTE_STATUS.PUBLISHED, deleted_at: null },
        select: { id: true, updated_at: true },
      });
      const versions = new Map(
        rows.map((row) => [row.id.toString(), row.updated_at.toISOString()]),
      );
      return items.every((item) => versions.get(item.id) === item.updated_at);
    } catch {
      return false;
    }
  }

  private async withFavoriteState<T extends { id: string }>(items: T[], userId?: bigint) {
    if (!userId || !items.length) return items.map((item) => ({ ...item, is_favorited: false }));
    const favorites = await this.prisma.routeFavorite.findMany({
      where: { user_id: userId, route_id: { in: items.map((item) => BigInt(item.id)) } },
      select: { route_id: true },
    });
    const ids = new Set(favorites.map((favorite) => favorite.route_id.toString()));
    return items.map((item) => ({ ...item, is_favorited: ids.has(item.id) }));
  }

  private serializeSummary(
    route: {
      id: bigint;
      title: string;
      summary: string | null;
      cover_image: string | null;
      city_code: string | null;
      city_name: string | null;
      type: string | null;
      difficulty: string | null;
      distance_km: Prisma.Decimal | null;
      duration_min: number | null;
      favorite_count: number;
      sort_weight: number;
      updated_at: Date;
      district_code?: string | null;
      regions?: Array<{ city_code: string; district_code: string; has_start: boolean }>;
    },
    region?: Pick<RouteListQueryDto, 'city_code' | 'district_code'>,
  ) {
    return {
      id: route.id.toString(),
      title: route.title,
      summary: route.summary,
      cover_image: route.cover_image,
      city_code: route.city_code,
      city_name: route.city_name,
      district_code: route.district_code ?? null,
      region_match: this.routeRegionMatch(route, region),
      type: route.type,
      difficulty: route.difficulty,
      distance_km: route.distance_km?.toString() ?? null,
      duration_min: route.duration_min,
      favorite_count: route.favorite_count,
      sort_weight: route.sort_weight,
      updated_at: route.updated_at.toISOString(),
    };
  }

  private regionWhere(query: RouteListQueryDto): Prisma.RouteWhereInput {
    if (!query.city_code) return {};
    const code = {
      city_code: query.city_code,
      ...(query.district_code ? { district_code: query.district_code } : {}),
    };
    const primary: Prisma.RouteWhereInput = code;
    const through: Prisma.RouteWhereInput = {
      regions: {
        some: {
          city_code: query.city_code,
          ...(query.district_code ? { district_code: query.district_code } : {}),
        },
      },
    };
    if (query.region_scope === 'start') return primary;
    // SQL NOT(city = x AND district = y) also excludes NULL values; those
    // legacy rows can still have a valid coverage match and must remain visible.
    if (query.region_scope === 'through')
      return {
        AND: [
          through,
          {
            OR: [
              { city_code: { not: query.city_code } },
              { city_code: null },
              ...(query.district_code
                ? [{ district_code: { not: query.district_code } }, { district_code: null }]
                : []),
            ],
          },
        ],
      };
    return { OR: [primary, through] };
  }

  private routeRegionMatch(
    route: {
      city_code: string | null;
      district_code?: string | null;
      regions?: Array<{ city_code: string; district_code: string }>;
    },
    region?: Pick<RouteListQueryDto, 'city_code' | 'district_code'>,
  ): 'start' | 'through' | null {
    if (!region?.city_code) return null;
    const primary =
      route.city_code === region.city_code &&
      (!region.district_code || route.district_code === region.district_code);
    if (primary) return 'start';
    return route.regions?.some(
      (item) =>
        item.city_code === region.city_code &&
        (!region.district_code || item.district_code === region.district_code),
    )
      ? 'through'
      : null;
  }

  private serializeDetail(route: PublicRouteRecord) {
    return {
      ...this.serializeSummary(route),
      images: this.stringArray(route.images),
      polyline: this.polyline(route.polyline),
      road_condition: route.road_condition,
      suitable_motorcycles: route.suitable_motorcycles,
      best_season: route.best_season,
      safety_notice: route.safety_notice,
      district_code: route.district_code,
      polyline_status: route.polyline_status,
      polyline_provider: route.polyline_provider,
      polyline_updated_at: route.polyline_updated_at?.toISOString() ?? null,
      external_route_url: route.external_url_status === 1 ? route.external_route_url : null,
      external_route_provider: route.external_route_provider,
      external_url_status: route.external_url_status,
      published_at: route.published_at?.toISOString() ?? null,
      points: route.points.map((point) => ({
        id: point.id.toString(),
        order: point.order,
        name: point.name,
        latitude: point.latitude.toString(),
        longitude: point.longitude.toString(),
        type: point.type,
        description: point.description,
        address: point.address,
        province_code: point.province_code,
        city_code: point.city_code,
        district_code: point.district_code,
      })),
    };
  }

  private relatedRideInclude() {
    return {
      user: { select: { id: true, nickname: true, avatar_url: true } },
      participants: {
        where: { status: 1, deleted_at: null },
        select: { id: true },
      },
    } satisfies Prisma.RideInclude;
  }

  private serializeRelatedRide(
    ride: Prisma.RideGetPayload<{ include: ReturnType<RouteService['relatedRideInclude']> }>,
  ) {
    return {
      id: ride.id.toString(),
      title: ride.title,
      ride_style: ride.ride_style,
      departure_time: ride.departure_time.toISOString(),
      meetup_address: ride.meetup_address,
      destination: ride.destination,
      max_people: ride.max_people,
      join_count: ride.join_count,
      is_full: ride.join_count >= ride.max_people,
      status: ride.status,
      city_code: ride.city_code,
      creator: {
        id: ride.user.id.toString(),
        nickname: ride.user.nickname,
        avatar_url: ride.user.avatar_url,
      },
    };
  }

  private stringArray(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private polyline(value: Prisma.JsonValue | null): Array<{ latitude: number; longitude: number }> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ latitude, longitude }]
        : [];
    });
  }
}
