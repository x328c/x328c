import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateUserRouteDto,
  UpdateUserRouteDto,
  UserRouteMineQueryDto,
  UserRoutePublicQueryDto,
} from './dto/user-route.dto';
import { normalizeExternalRouteUrl } from './external-route-link';
import { UserService } from '../user/user.service';
import { MapProviderService } from '../map/map-provider.service';
import { RegionService } from '../region/region.service';
import { readRegionPage, RegionPhase } from '../region/region-pagination';

type PublicRouteCursor = { id: string; createdAt?: string; phase?: RegionPhase };

@Injectable()
export class UserRouteService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly users?: UserService,
    @Optional() private readonly maps?: MapProviderService,
    @Optional() private readonly regions?: RegionService,
  ) {}

  async create(userId: bigint, dto: CreateUserRouteDto) {
    const prepared = await this.prepareMapData(dto);
    dto = prepared.dto;
    if (dto.visibility === 2) await this.users?.assertProfileComplete(userId);
    this.assertEndLocation(dto);
    await this.assertImagesOwned(userId, dto.images ?? []);
    const optional = this.writeData(dto, prepared.polyline);
    const route = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userRoute.create({
        data: {
          ...optional,
          user_id: userId,
          title: dto.title.normalize('NFKC').trim(),
          start_location: dto.start_location.trim(),
          start_lat: dto.start_lat,
          start_lng: dto.start_lng,
        } as Prisma.UserRouteUncheckedCreateInput,
        include: { user: true },
      });
      await this.replacePointCoverage(tx, created.id, dto);
      return created;
    });
    return this.serialize(route, userId);
  }

  async mine(userId: bigint, query: UserRouteMineQueryDto) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.parseId(query.cursor) : undefined;
    const records = await this.prisma.userRoute.findMany({
      where: {
        user_id: userId,
        status: 1,
        ...(query.visibility ? { visibility: query.visibility } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: { user: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return this.page(records, limit, userId);
  }

  async publicList(query: UserRoutePublicQueryDto, viewerId?: bigint) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.decodePublicCursor(query.cursor) : undefined;
    const keyword = query.keyword?.normalize('NFKC').trim();
    const read = (
      regionQuery: UserRoutePublicQueryDto,
      after: PublicRouteCursor | undefined,
      take: number,
    ) =>
      this.prisma.userRoute.findMany({
        where: {
          visibility: 2,
          status: 1,
          AND: [
            this.userRouteRegionWhere(regionQuery),
            ...(keyword
              ? [
                  {
                    OR: [
                      { title: { contains: keyword } },
                      { start_location: { contains: keyword } },
                      { end_location: { contains: keyword } },
                    ],
                  },
                ]
              : []),
            ...(after ? [this.publicCursorWhere(after)] : []),
          ],
          ...(query.difficulty ? { difficulty: query.difficulty } : {}),
          ...(query.min_distance !== undefined || query.max_distance !== undefined
            ? {
                total_distance: {
                  ...(query.min_distance !== undefined ? { gte: query.min_distance } : {}),
                  ...(query.max_distance !== undefined ? { lte: query.max_distance } : {}),
                },
              }
            : {}),
        },
        include: {
          user: true,
          points: { orderBy: { order: 'asc' } },
          regions: true,
          ...(viewerId
            ? { favorites: { where: { user_id: viewerId }, select: { id: true }, take: 1 } }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
      });
    const partitioned = Boolean(
      query.city_code && (!query.region_scope || query.region_scope === 'any'),
    );
    const grouped = partitioned
      ? await readRegionPage({
          limit,
          cursor,
          phase: cursor?.phase,
          read: (phase, after, take) => read({ ...query, region_scope: phase }, after, take),
        })
      : undefined;
    const records = grouped ? [] : await read(query, cursor, limit + 1);
    const hasMore = grouped ? grouped.hasMore : records.length > limit;
    const rows = grouped ? grouped.rows.map((row) => row.value) : records.slice(0, limit);
    const last = rows.at(-1);
    return {
      items: rows.map((row) => this.serialize(row, viewerId, query)),
      hasMore,
      nextCursor:
        hasMore && last
          ? `rp1.${Buffer.from(
              JSON.stringify({
                id: last.id.toString(),
                createdAt: last.created_at.toISOString(),
                ...(grouped ? { phase: grouped.rows.at(-1)!.phase } : {}),
              }),
            ).toString('base64url')}`
          : null,
    };
  }

  private decodePublicCursor(value: string): PublicRouteCursor {
    // Existing clients treat cursors as opaque; accept their old numeric cursor
    // during rollout, but issue timestamp/ID/partition cursors for new pages.
    if (/^[1-9]\d*$/.test(value)) return { id: this.parseId(value).toString() };
    try {
      if (!value.startsWith('rp1.')) throw new Error('invalid cursor');
      const cursor = JSON.parse(
        Buffer.from(value.slice(4), 'base64url').toString('utf8'),
      ) as PublicRouteCursor;
      if (
        typeof cursor.id !== 'string' ||
        !/^[1-9]\d*$/.test(cursor.id) ||
        typeof cursor.createdAt !== 'string' ||
        Number.isNaN(new Date(cursor.createdAt).getTime()) ||
        (cursor.phase !== undefined && cursor.phase !== 'start' && cursor.phase !== 'through')
      )
        throw new Error('invalid cursor');
      return cursor;
    } catch {
      throw new AppException(55004, '无效的分页游标');
    }
  }

  private publicCursorWhere(cursor: PublicRouteCursor): Prisma.UserRouteWhereInput {
    const id = BigInt(cursor.id);
    if (!cursor.createdAt) return { id: { lt: id } };
    const createdAt = new Date(cursor.createdAt);
    return { OR: [{ created_at: { lt: createdAt } }, { created_at: createdAt, id: { lt: id } }] };
  }

  async detail(id: bigint, viewerId?: bigint) {
    const route = await this.prisma.userRoute.findFirst({
      where: { id, status: 1 },
      include: {
        user: true,
        points: { orderBy: { order: 'asc' } },
        ...(viewerId
          ? { favorites: { where: { user_id: viewerId }, select: { id: true }, take: 1 } }
          : {}),
      },
    });
    if (!route || (route.visibility === 1 && route.user_id !== viewerId)) {
      throw new AppException(55001, '路线不存在或无权查看', HttpStatus.NOT_FOUND);
    }
    if (route.visibility === 2 && route.user_id !== viewerId) {
      await this.prisma.userRoute.update({ where: { id }, data: { view_count: { increment: 1 } } });
      route.view_count += 1;
    }
    return this.serialize(route, viewerId);
  }

  async share(id: bigint, viewerId?: bigint) {
    const route = (await this.detail(id, viewerId)) as ReturnType<UserRouteService['serialize']> & {
      title: string;
      visibility: number;
    };
    if (route.visibility !== 2) {
      throw new AppException(53103, '私密路线不可分享', HttpStatus.FORBIDDEN);
    }
    return {
      title: `${route.title}｜骑友路线`,
      path: `/pages/routes/detail/index?id=${route.id}`,
      imageUrl: route.images[0] ?? process.env.ROUTE_SHARE_IMAGE_URL ?? '',
    };
  }

  async update(userId: bigint, id: bigint, dto: UpdateUserRouteDto) {
    const current = await this.owned(userId, id);
    const endpointChanged =
      (dto.end_location !== undefined && dto.end_location !== current.end_location) ||
      (dto.end_lat !== undefined && dto.end_lat !== current.end_lat?.toNumber()) ||
      (dto.end_lng !== undefined && dto.end_lng !== current.end_lng?.toNumber());
    if (endpointChanged && !dto.end_point)
      throw new AppException(55004, '终点已变更，请重新确认终点所属城市');
    if (dto.visibility === 2 && current.visibility !== 2) {
      await this.users?.assertProfileComplete(userId);
    }
    this.assertEndLocation({
      end_location: dto.end_location ?? current.end_location ?? undefined,
      end_lat: dto.end_lat ?? current.end_lat?.toNumber(),
      end_lng: dto.end_lng ?? current.end_lng?.toNumber(),
    });
    if (dto.images) await this.assertImagesOwned(userId, dto.images);
    const storedWaypoints = Array.isArray(current.waypoints)
      ? (current.waypoints as unknown as CreateUserRouteDto['waypoints'])
      : [];
    const storedImages = Array.isArray(current.images)
      ? (current.images as unknown as string[])
      : [];
    const storedEndPoint = current.points?.find((point) => point.type === 'end');
    const merged = {
      title: dto.title ?? current.title,
      description: dto.description ?? current.description ?? undefined,
      start_location: dto.start_location ?? current.start_location,
      start_lat: dto.start_lat ?? current.start_lat.toNumber(),
      start_lng: dto.start_lng ?? current.start_lng.toNumber(),
      end_location: dto.end_location ?? current.end_location ?? undefined,
      end_lat: dto.end_lat ?? current.end_lat?.toNumber() ?? undefined,
      end_lng: dto.end_lng ?? current.end_lng?.toNumber() ?? undefined,
      end_point:
        dto.end_point ??
        (storedEndPoint
          ? {
              name: storedEndPoint.name,
              address: storedEndPoint.address ?? undefined,
              latitude: storedEndPoint.latitude.toNumber(),
              longitude: storedEndPoint.longitude.toNumber(),
              province_code: storedEndPoint.province_code ?? undefined,
              city_code: storedEndPoint.city_code ?? undefined,
              district_code: storedEndPoint.district_code ?? undefined,
            }
          : undefined),
      waypoints: dto.waypoints ?? storedWaypoints,
      city_code: dto.city_code ?? current.city_code ?? '',
      district_code: dto.district_code ?? current.district_code ?? undefined,
      external_route_url: dto.external_route_url ?? current.external_route_url ?? undefined,
      total_distance: dto.total_distance ?? current.total_distance ?? undefined,
      estimated_time: dto.estimated_time ?? current.estimated_time ?? undefined,
      difficulty: dto.difficulty ?? current.difficulty ?? undefined,
      images: dto.images ?? storedImages,
      visibility: dto.visibility ?? (current.visibility as 1 | 2),
    } satisfies CreateUserRouteDto;
    const prepared = await this.prepareMapData(merged);
    const route = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userRoute.update({
        where: { id },
        data: this.writeData(prepared.dto, prepared.polyline),
        include: { user: true },
      });
      await this.replacePointCoverage(tx, id, prepared.dto);
      return updated;
    });
    return this.serialize(route, userId);
  }

  async remove(userId: bigint, id: bigint) {
    await this.owned(userId, id);
    await this.prisma.userRoute.update({ where: { id }, data: { status: 2 } });
    return { success: true };
  }

  async favorite(userId: bigint, id: bigint) {
    const route = await this.prisma.userRoute.findFirst({
      where: { id, visibility: 2, status: 1 },
      select: { id: true },
    });
    if (!route) throw new AppException(55001, '公开路线不存在', HttpStatus.NOT_FOUND);
    try {
      await this.prisma.$transaction([
        this.prisma.userRouteFavorite.create({ data: { user_id: userId, user_route_id: id } }),
        this.prisma.userRoute.update({ where: { id }, data: { favorite_count: { increment: 1 } } }),
      ]);
      return { favorited: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { favorited: true, replayed: true };
      }
      throw error;
    }
  }

  private async owned(userId: bigint, id: bigint) {
    const route = await this.prisma.userRoute.findFirst({
      where: { id, user_id: userId, status: 1 },
      include: { points: { orderBy: { order: 'asc' } } },
    });
    if (!route) throw new AppException(55001, '路线不存在或无权操作', HttpStatus.NOT_FOUND);
    return route;
  }

  private writeData(
    dto: UpdateUserRouteDto | CreateUserRouteDto,
    plannedPolyline?: Array<{ latitude: number; longitude: number }> | null,
  ): Prisma.UserRouteUncheckedUpdateInput {
    return {
      ...(dto.title !== undefined ? { title: dto.title.normalize('NFKC').trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.start_location !== undefined ? { start_location: dto.start_location.trim() } : {}),
      ...(dto.start_lat !== undefined ? { start_lat: dto.start_lat } : {}),
      ...(dto.start_lng !== undefined ? { start_lng: dto.start_lng } : {}),
      ...(dto.end_location !== undefined ? { end_location: dto.end_location.trim() } : {}),
      ...(dto.end_lat !== undefined ? { end_lat: dto.end_lat } : {}),
      ...(dto.end_lng !== undefined ? { end_lng: dto.end_lng } : {}),
      ...(dto.waypoints !== undefined
        ? { waypoints: dto.waypoints as unknown as Prisma.InputJsonValue }
        : {}),
      ...(dto.city_code !== undefined ? { city_code: dto.city_code || null } : {}),
      ...(dto.district_code !== undefined ? { district_code: dto.district_code || null } : {}),
      ...(dto.external_route_url !== undefined
        ? normalizeExternalRouteUrl(dto.external_route_url)
        : {}),
      ...(dto.start_lat !== undefined ||
      dto.start_lng !== undefined ||
      dto.waypoints !== undefined ||
      dto.end_lat !== undefined ||
      dto.end_lng !== undefined
        ? {
            polyline: (plannedPolyline ??
              this.pointSequence(dto)) as unknown as Prisma.InputJsonValue,
            polyline_status: (plannedPolyline ?? this.pointSequence(dto)).length >= 2 ? 1 : 0,
            polyline_provider: plannedPolyline?.length
              ? 'tencent-driving'
              : this.pointSequence(dto).length >= 2
                ? 'point-sequence'
                : null,
            polyline_updated_at: new Date(),
          }
        : {}),
      ...(dto.total_distance !== undefined ? { total_distance: dto.total_distance } : {}),
      ...(dto.estimated_time !== undefined ? { estimated_time: dto.estimated_time } : {}),
      ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
      ...(dto.images !== undefined ? { images: dto.images as Prisma.InputJsonValue } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
    };
  }

  private assertEndLocation(dto: { end_location?: string; end_lat?: number; end_lng?: number }) {
    const provided = [dto.end_location, dto.end_lat, dto.end_lng].filter(
      (value) => value !== undefined,
    );
    if (provided.length !== 0 && provided.length !== 3) {
      throw new AppException(55002, '终点名称和坐标必须同时填写', HttpStatus.BAD_REQUEST);
    }
  }

  private async assertImagesOwned(userId: bigint, images: string[]) {
    if (!images.length) return;
    const unique = [...new Set(images)];
    if (unique.length !== images.length || images.length > 6) {
      throw new AppException(55003, '路线图片不能重复且最多 6 张', HttpStatus.BAD_REQUEST);
    }
    const count = await this.prisma.fileRecord.count({
      where: { user_id: userId, cdn_url: { in: unique }, file_key: { startsWith: 'user-routes/' } },
    });
    if (count !== unique.length) {
      throw new AppException(55003, '路线图片无效或不属于当前用户', HttpStatus.BAD_REQUEST);
    }
  }

  private page(
    records: Array<Record<string, unknown> & { id: bigint }>,
    limit: number,
    viewerId?: bigint,
    region?: Pick<UserRoutePublicQueryDto, 'city_code' | 'district_code'>,
  ) {
    const hasMore = records.length > limit;
    const pageRecords = records.slice(0, limit);
    const items = pageRecords
      .map((item) => this.serialize(item, viewerId, region))
      .sort(
        (left, right) =>
          (left.region_match === 'through' ? 1 : 0) - (right.region_match === 'through' ? 1 : 0),
      );
    return {
      items,
      hasMore,
      nextCursor: hasMore ? (pageRecords.at(-1)?.id.toString() ?? null) : null,
    };
  }

  private serialize(
    item: Record<string, unknown> & { id: bigint },
    viewerId?: bigint,
    region?: Pick<UserRoutePublicQueryDto, 'city_code' | 'district_code'>,
  ) {
    const decimal = (value: unknown) =>
      value instanceof Prisma.Decimal ? value.toNumber() : value;
    const array = (value: unknown) => (Array.isArray(value) ? value : []);
    const user = item.user as { id: bigint; nickname: string; avatar_url: string | null };
    const favorites = item.favorites as Array<{ id: bigint }> | undefined;
    const storedPoints = Array.isArray(item.points)
      ? (item.points as Array<Record<string, unknown>>)
      : [];
    const endPoint = storedPoints.find((point) => point.type === 'end');
    return {
      ...item,
      id: item.id.toString(),
      user_id: String(item.user_id),
      start_lat: decimal(item.start_lat),
      start_lng: decimal(item.start_lng),
      end_lat: decimal(item.end_lat),
      end_lng: decimal(item.end_lng),
      end_point: endPoint
        ? {
            name: endPoint.name,
            address: endPoint.address,
            latitude: decimal(endPoint.latitude),
            longitude: decimal(endPoint.longitude),
            province_code: endPoint.province_code,
            city_code: endPoint.city_code,
            district_code: endPoint.district_code,
          }
        : null,
      waypoints: array(item.waypoints),
      polyline: array(item.polyline),
      images: array(item.images),
      is_owner: viewerId !== undefined && BigInt(String(item.user_id)) === viewerId,
      is_favorited: Boolean(favorites?.length),
      region_match: this.userRouteRegionMatch(item, region),
      creator: { id: user.id.toString(), nickname: user.nickname, avatar_url: user.avatar_url },
      user: undefined,
      favorites: undefined,
      regions: undefined,
      points: undefined,
    };
  }

  private userRouteRegionWhere(query: UserRoutePublicQueryDto): Prisma.UserRouteWhereInput {
    if (!query.city_code) return {};
    const primary: Prisma.UserRouteWhereInput = {
      city_code: query.city_code,
      ...(query.district_code ? { district_code: query.district_code } : {}),
    };
    const through: Prisma.UserRouteWhereInput = {
      regions: {
        some: {
          city_code: query.city_code,
          ...(query.district_code ? { district_code: query.district_code } : {}),
        },
      },
    };
    if (query.region_scope === 'start') return primary;
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

  private userRouteRegionMatch(
    item: Record<string, unknown>,
    region?: Pick<UserRoutePublicQueryDto, 'city_code' | 'district_code'>,
  ): 'start' | 'through' | null {
    if (!region?.city_code) return null;
    if (
      item.city_code === region.city_code &&
      (!region.district_code || item.district_code === region.district_code)
    )
      return 'start';
    const regions = item.regions as Array<{ city_code: string; district_code: string }> | undefined;
    return regions?.some(
      (entry) =>
        entry.city_code === region.city_code &&
        (!region.district_code || entry.district_code === region.district_code),
    )
      ? 'through'
      : null;
  }

  private pointSequence(dto: UpdateUserRouteDto | CreateUserRouteDto) {
    const points: Array<{ latitude: number; longitude: number }> = [];
    if (dto.start_lat !== undefined && dto.start_lng !== undefined) {
      points.push({ latitude: dto.start_lat, longitude: dto.start_lng });
    }
    for (const point of dto.waypoints ?? []) {
      points.push({ latitude: point.latitude, longitude: point.longitude });
    }
    if (dto.end_lat !== undefined && dto.end_lng !== undefined) {
      points.push({ latitude: dto.end_lat, longitude: dto.end_lng });
    }
    return points;
  }

  private async prepareMapData(dto: CreateUserRouteDto) {
    if (dto.end_point) {
      dto = {
        ...dto,
        end_location: dto.end_point.name,
        end_lat: dto.end_point.latitude,
        end_lng: dto.end_point.longitude,
      };
    }
    this.regions?.assertPoint(
      {
        latitude: dto.start_lat,
        longitude: dto.start_lng,
        city_code: dto.city_code,
        district_code: dto.district_code,
      },
      '起点',
    );
    for (const [index, point] of (dto.waypoints ?? []).entries())
      this.regions?.assertPoint(point, `途经点 ${index + 1}`);
    if (dto.end_location) {
      if (!dto.end_point) throw new AppException(55004, '终点缺少所属城市，请重新选点');
      this.regions?.assertPoint(dto.end_point, '终点');
    }
    const polyline = this.maps ? await this.maps.planDrivingRoute(this.pointSequence(dto)) : null;
    return { dto, polyline };
  }

  private async replacePointCoverage(
    tx: Prisma.TransactionClient,
    routeId: bigint,
    dto: CreateUserRouteDto,
  ) {
    const points: Prisma.UserRoutePointCreateManyInput[] = [
      {
        user_route_id: routeId,
        order: 0,
        type: 'start',
        name: dto.start_location.trim(),
        latitude: new Prisma.Decimal(dto.start_lat),
        longitude: new Prisma.Decimal(dto.start_lng),
        province_code: dto.city_code ? '650000' : null,
        city_code: dto.city_code ?? null,
        district_code: dto.district_code ?? null,
      },
      ...(dto.waypoints ?? []).map((point, index) => ({
        user_route_id: routeId,
        order: index + 1,
        type: 'waypoint',
        name: point.name.trim(),
        address: point.address,
        latitude: new Prisma.Decimal(point.latitude),
        longitude: new Prisma.Decimal(point.longitude),
        province_code: point.province_code ?? '650000',
        city_code: point.city_code,
        district_code: point.district_code,
      })),
      ...(dto.end_location && dto.end_lat !== undefined && dto.end_lng !== undefined
        ? [
            {
              user_route_id: routeId,
              order: (dto.waypoints?.length ?? 0) + 1,
              type: 'end',
              name: dto.end_location.trim(),
              address: dto.end_point?.address,
              latitude: new Prisma.Decimal(dto.end_lat),
              longitude: new Prisma.Decimal(dto.end_lng),
              province_code: dto.end_point?.province_code ?? '650000',
              city_code: dto.end_point?.city_code,
              district_code: dto.end_point?.district_code,
            },
          ]
        : []),
    ];
    await tx.userRoutePoint.deleteMany({ where: { user_route_id: routeId } });
    await tx.userRouteRegion.deleteMany({ where: { user_route_id: routeId } });
    if (points.length) await tx.userRoutePoint.createMany({ data: points });

    const regions = new Map<string, Prisma.UserRouteRegionCreateManyInput>();
    for (const point of points) {
      if (!point.city_code) continue;
      const district = point.district_code ?? '';
      const key = `${point.city_code}:${district}`;
      const current = regions.get(key);
      regions.set(key, {
        user_route_id: routeId,
        city_code: point.city_code,
        district_code: district,
        has_start: Boolean(current?.has_start || point.type === 'start'),
        has_waypoint: Boolean(current?.has_waypoint || point.type !== 'start'),
        point_count: (current?.point_count ?? 0) + 1,
      });
    }
    if (regions.size) await tx.userRouteRegion.createMany({ data: [...regions.values()] });
  }

  private parseId(value: string) {
    if (!/^[1-9]\d*$/.test(value)) throw new AppException(1001, '无效游标');
    return BigInt(value);
  }
}
