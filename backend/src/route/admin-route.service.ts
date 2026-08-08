import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminRouteQueryDto, CreateRouteDto, RoutePointDto, UpdateRouteDto } from './dto';
import { ROUTE_LIMITS, ROUTE_STATUS } from './route.constants';
import { RouteCacheService } from './route-cache.service';

const adminRouteInclude = {
  maintainer: { select: { id: true, username: true } },
  points: { orderBy: { order: 'asc' as const } },
  ride_links: { orderBy: { id: 'asc' as const }, select: { ride_id: true, source: true } },
} satisfies Prisma.RouteInclude;

type AdminRouteRecord = Prisma.RouteGetPayload<{ include: typeof adminRouteInclude }>;

@Injectable()
export class AdminRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogs: OperationLogService,
    private readonly cache: RouteCacheService,
  ) {}

  async list(query: AdminRouteQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RouteWhereInput = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.city_code ? { city_code: query.city_code } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { city_name: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        include: adminRouteInclude,
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.route.count({ where }),
    ]);
    return {
      list: items.map((item) => this.serialize(item)),
      pagination: { page, pageSize, total },
    };
  }

  async detail(id: bigint) {
    return this.serialize(await this.findRoute(id));
  }

  async create(dto: CreateRouteDto, actor: OperationActorContext) {
    this.validateDraft(dto);
    const routeId = await this.prisma.$transaction(async (tx) => {
      await this.assertRelatedRides(tx, dto.related_ride_ids);
      const route = await tx.route.create({
        data: {
          ...this.routeData(dto),
          maintainer_id: actor.adminId,
          status: ROUTE_STATUS.DRAFT,
        } as Prisma.RouteUncheckedCreateInput,
      });
      if (dto.points?.length) {
        await tx.routePoint.createMany({ data: this.pointData(dto.points, route.id) });
      }
      if (dto.related_ride_ids?.length) {
        await tx.routeRideLink.createMany({
          data: dto.related_ride_ids.map((rideId) => ({
            route_id: route.id,
            ride_id: BigInt(rideId),
            source: 'manual',
          })),
        });
      }
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'route.create',
        objectType: 'route',
        objectId: route.id.toString(),
        reason: '创建路线草稿',
        afterSummary: this.auditSummary(route),
      });
      return route.id;
    });
    await this.cache.invalidate(routeId);
    return this.detail(routeId);
  }

  async update(id: bigint, dto: UpdateRouteDto, actor: OperationActorContext) {
    this.validateDraft(dto);
    const route = await this.findRoute(id);
    const nextStatus = route.status === ROUTE_STATUS.PUBLISHED ? ROUTE_STATUS.DRAFT : route.status;
    await this.prisma.$transaction(async (tx) => {
      await this.assertRelatedRides(tx, dto.related_ride_ids);
      const mutation = await tx.route.updateMany({
        where: { id, status: route.status, deleted_at: null },
        data: {
          ...this.routeData(dto),
          status: nextStatus,
          ...(route.status === ROUTE_STATUS.PUBLISHED
            ? { published_at: null, offlined_at: null, offline_reason: null }
            : {}),
        } as Prisma.RouteUncheckedUpdateInput,
      });
      this.assertStateMutation(mutation.count);
      const updated = await tx.route.findUniqueOrThrow({ where: { id } });
      if (dto.points !== undefined) {
        await tx.routePoint.deleteMany({ where: { route_id: id } });
        if (dto.points.length) {
          await tx.routePoint.createMany({ data: this.pointData(dto.points, id) });
        }
      }
      if (dto.related_ride_ids !== undefined) {
        await tx.routeRideLink.deleteMany({ where: { route_id: id } });
        if (dto.related_ride_ids.length) {
          await tx.routeRideLink.createMany({
            data: dto.related_ride_ids.map((rideId) => ({
              route_id: id,
              ride_id: BigInt(rideId),
              source: 'manual',
            })),
          });
        }
      }
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: route.status === ROUTE_STATUS.PUBLISHED ? 'route.edit_and_unpublish' : 'route.edit',
        objectType: 'route',
        objectId: id.toString(),
        reason:
          route.status === ROUTE_STATUS.PUBLISHED
            ? '编辑已发布路线，自动转为草稿待重新发布'
            : '编辑路线',
        beforeSummary: this.auditSummary(route),
        afterSummary: this.auditSummary(updated),
      });
    });
    await this.cache.invalidate(id);
    return this.detail(id);
  }

  async publish(id: bigint, actor: OperationActorContext) {
    const route = await this.findRoute(id);
    if (route.status === ROUTE_STATUS.PUBLISHED) {
      throw new AppException(53005, '路线已发布，无需重复发布');
    }
    this.validatePublish(route);
    await this.prisma.$transaction(async (tx) => {
      const mutation = await tx.route.updateMany({
        where: { id, status: route.status, deleted_at: null },
        data: {
          status: ROUTE_STATUS.PUBLISHED,
          published_at: new Date(),
          offlined_at: null,
          offline_reason: null,
        },
      });
      this.assertStateMutation(mutation.count);
      const updated = await tx.route.findUniqueOrThrow({ where: { id } });
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'route.publish',
        objectType: 'route',
        objectId: id.toString(),
        reason: '发布路线',
        beforeSummary: this.auditSummary(route),
        afterSummary: this.auditSummary(updated),
      });
    });
    await this.cache.invalidate(id);
    return this.detail(id);
  }

  async offline(id: bigint, reason: string, actor: OperationActorContext) {
    const route = await this.findRoute(id);
    if (route.status !== ROUTE_STATUS.PUBLISHED) {
      throw new AppException(53006, '只有已发布路线可以下架');
    }
    await this.prisma.$transaction(async (tx) => {
      const mutation = await tx.route.updateMany({
        where: { id, status: ROUTE_STATUS.PUBLISHED, deleted_at: null },
        data: { status: ROUTE_STATUS.OFFLINE, offlined_at: new Date(), offline_reason: reason },
      });
      this.assertStateMutation(mutation.count);
      const updated = await tx.route.findUniqueOrThrow({ where: { id } });
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'route.offline',
        objectType: 'route',
        objectId: id.toString(),
        reason,
        beforeSummary: this.auditSummary(route),
        afterSummary: this.auditSummary(updated),
      });
    });
    await this.cache.invalidate(id);
    return this.detail(id);
  }

  private async findRoute(id: bigint): Promise<AdminRouteRecord> {
    const route = await this.prisma.route.findFirst({
      where: { id, deleted_at: null },
      include: adminRouteInclude,
    });
    if (!route) throw new AppException(53002, '路线不存在', HttpStatus.NOT_FOUND);
    return route;
  }

  private assertStateMutation(count: number): void {
    if (!count) {
      throw new AppException(53008, '路线状态已变化，请刷新后重试', HttpStatus.CONFLICT);
    }
  }

  private validateDraft(dto: UpdateRouteDto): void {
    if (dto.points !== undefined) this.validatePointOrder(dto.points, false);
    if (dto.polyline) this.validateCoordinates(dto.polyline);
  }

  private validatePublish(route: AdminRouteRecord): void {
    const missing = [
      ['cover_image', route.cover_image],
      ['city_code', route.city_code],
      ['city_name', route.city_name],
      ['type', route.type],
      ['difficulty', route.difficulty],
      ['distance_km', route.distance_km],
      ['duration_min', route.duration_min],
      ['road_condition', route.road_condition],
      ['safety_notice', route.safety_notice],
      ['maintainer_id', route.maintainer_id],
    ]
      .filter(([, value]) => value === null || value === undefined || value === '')
      .map(([field]) => field);
    const polyline = this.polyline(route.polyline);
    if (polyline.length < 2) missing.push('polyline');
    this.validatePointOrder(
      route.points.map((point) => ({
        order: point.order,
        name: point.name,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        type: point.type as RoutePointDto['type'],
        description: point.description ?? undefined,
      })),
      true,
    );
    if (missing.length) {
      throw new AppException(53007, `发布字段不完整：${missing.join(', ')}`);
    }
  }

  private validatePointOrder(points: RoutePointDto[], requireEndpoints: boolean): void {
    if (points.length > ROUTE_LIMITS.points) throw new AppException(53007, '路线点位数量超限');
    const sorted = [...points].sort((a, b) => a.order - b.order);
    if (sorted.some((point, index) => point.order !== index)) {
      throw new AppException(53007, '点位顺序必须从 0 开始且连续');
    }
    this.validateCoordinates(points);
    if (!requireEndpoints) return;
    const starts = sorted.filter((point) => point.type === 'start');
    const ends = sorted.filter((point) => point.type === 'end');
    if (
      starts.length !== 1 ||
      ends.length !== 1 ||
      starts[0].order !== 0 ||
      ends[0].order !== sorted.length - 1
    ) {
      throw new AppException(53007, '路线必须有唯一的首位起点和末位终点');
    }
  }

  private validateCoordinates(points: Array<{ latitude: number; longitude: number }>): void {
    if (
      points.some(
        (point) =>
          point.latitude < -90 ||
          point.latitude > 90 ||
          point.longitude < -180 ||
          point.longitude > 180,
      )
    ) {
      throw new AppException(53007, '路线坐标超出有效范围');
    }
  }

  private async assertRelatedRides(
    tx: Prisma.TransactionClient,
    rideIds?: string[],
  ): Promise<void> {
    if (!rideIds?.length) return;
    const uniqueIds = [...new Set(rideIds)];
    if (uniqueIds.length !== rideIds.length) throw new AppException(53007, '关联约骑不能重复');
    const count = await tx.ride.count({
      where: { id: { in: uniqueIds.map((id) => BigInt(id)) }, deleted_at: null },
    });
    if (count !== uniqueIds.length) throw new AppException(53007, '存在无效的关联约骑');
  }

  private routeData(dto: UpdateRouteDto): Record<string, unknown> {
    const fields = { ...dto } as Record<string, unknown>;
    const { images, polyline, distance_km: distanceKm } = dto;
    delete fields.points;
    delete fields.related_ride_ids;
    delete fields.images;
    delete fields.polyline;
    delete fields.distance_km;
    return {
      ...fields,
      ...(images !== undefined ? { images: images as Prisma.InputJsonValue } : {}),
      ...(polyline !== undefined ? { polyline: polyline as unknown as Prisma.InputJsonValue } : {}),
      ...(distanceKm !== undefined ? { distance_km: new Prisma.Decimal(distanceKm) } : {}),
    };
  }

  private pointData(points: RoutePointDto[], routeId: bigint): Prisma.RoutePointCreateManyInput[] {
    return points.map((point) => ({
      route_id: routeId,
      order: point.order,
      name: point.name,
      latitude: new Prisma.Decimal(point.latitude),
      longitude: new Prisma.Decimal(point.longitude),
      type: point.type,
      description: point.description,
    }));
  }

  private serialize(route: AdminRouteRecord) {
    return {
      id: route.id.toString(),
      title: route.title,
      summary: route.summary,
      cover_image: route.cover_image,
      images: this.stringArray(route.images),
      city_code: route.city_code,
      city_name: route.city_name,
      type: route.type,
      difficulty: route.difficulty,
      distance_km: route.distance_km?.toString() ?? null,
      duration_min: route.duration_min,
      polyline: this.polyline(route.polyline),
      road_condition: route.road_condition,
      suitable_motorcycles: route.suitable_motorcycles,
      best_season: route.best_season,
      safety_notice: route.safety_notice,
      status: route.status,
      sort_weight: route.sort_weight,
      favorite_count: route.favorite_count,
      published_at: route.published_at?.toISOString() ?? null,
      offlined_at: route.offlined_at?.toISOString() ?? null,
      offline_reason: route.offline_reason,
      created_at: route.created_at.toISOString(),
      updated_at: route.updated_at.toISOString(),
      maintainer: { id: route.maintainer.id.toString(), username: route.maintainer.username },
      points: route.points.map((point) => ({
        id: point.id.toString(),
        order: point.order,
        name: point.name,
        latitude: point.latitude.toString(),
        longitude: point.longitude.toString(),
        type: point.type,
        description: point.description,
      })),
      related_ride_ids: route.ride_links.map((link) => link.ride_id.toString()),
    };
  }

  private auditSummary(route: {
    title: string;
    status: number;
    city_code: string | null;
    difficulty: string | null;
    updated_at: Date;
  }): Record<string, unknown> {
    return {
      title: route.title,
      status: route.status,
      city_code: route.city_code,
      difficulty: route.difficulty,
      updated_at: route.updated_at.toISOString(),
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
