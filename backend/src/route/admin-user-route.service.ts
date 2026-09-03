import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminUserRouteQueryDto } from './dto';

const adminUserRouteInclude = {
  user: { select: { id: true, nickname: true, avatar_url: true, status: true } },
  points: { orderBy: { order: 'asc' as const } },
  regions: { orderBy: [{ city_code: 'asc' as const }, { district_code: 'asc' as const }] },
  ride_links: { select: { ride_id: true, source: true }, orderBy: { id: 'asc' as const } },
  _count: { select: { favorites: true, comments: true, ride_links: true } },
} satisfies Prisma.UserRouteInclude;

type AdminUserRouteRecord = Prisma.UserRouteGetPayload<{
  include: typeof adminUserRouteInclude;
}>;

@Injectable()
export class AdminUserRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogs: OperationLogService,
  ) {}

  async list(query: AdminUserRouteQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.normalize('NFKC').trim();
    const where: Prisma.UserRouteWhereInput = {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.visibility !== undefined ? { visibility: query.visibility } : {}),
      ...(query.city_code ? { city_code: query.city_code } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { start_location: { contains: keyword } },
              { end_location: { contains: keyword } },
              { user: { nickname: { contains: keyword } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userRoute.findMany({
        where,
        include: adminUserRouteInclude,
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userRoute.count({ where }),
    ]);
    return {
      list: items.map((item) => this.serialize(item)),
      pagination: { page, pageSize, total },
    };
  }

  async detail(id: bigint) {
    return this.serialize(await this.findRoute(id));
  }

  async offline(id: bigint, reason: string, actor: OperationActorContext) {
    const route = await this.findRoute(id);
    if (route.status !== 1) {
      throw new AppException(53111, '只有正常状态的用户路线可以下架', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      const mutation = await tx.userRoute.updateMany({
        where: { id, status: 1 },
        data: {
          status: 2,
          offlined_at: new Date(),
          offline_reason: reason,
          offlined_by: actor.adminId,
        },
      });
      if (!mutation.count) {
        throw new AppException(53111, '路线状态已变化，请刷新后重试', HttpStatus.CONFLICT);
      }
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'user_route.offline',
        objectType: 'user_route',
        objectId: id.toString(),
        reason,
        beforeSummary: this.auditSummary(route),
        afterSummary: { ...this.auditSummary(route), status: 2 },
      });
    });
    return this.detail(id);
  }

  async restore(id: bigint, reason: string, actor: OperationActorContext) {
    const route = await this.findRoute(id);
    if (route.status !== 2 || !route.offlined_at) {
      throw new AppException(53112, '仅可恢复由管理员下架的用户路线');
    }
    await this.prisma.$transaction(async (tx) => {
      const mutation = await tx.userRoute.updateMany({
        where: { id, status: 2, offlined_at: route.offlined_at },
        data: {
          status: 1,
          offlined_at: null,
          offline_reason: null,
          offlined_by: null,
        },
      });
      if (!mutation.count) {
        throw new AppException(53111, '路线状态已变化，请刷新后重试', HttpStatus.CONFLICT);
      }
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'user_route.restore',
        objectType: 'user_route',
        objectId: id.toString(),
        reason,
        beforeSummary: this.auditSummary(route),
        afterSummary: { ...this.auditSummary(route), status: 1 },
      });
    });
    return this.detail(id);
  }

  private async findRoute(id: bigint): Promise<AdminUserRouteRecord> {
    const route = await this.prisma.userRoute.findUnique({
      where: { id },
      include: adminUserRouteInclude,
    });
    if (!route) throw new AppException(53110, '用户路线不存在', HttpStatus.NOT_FOUND);
    return route;
  }

  private serialize(route: AdminUserRouteRecord) {
    return {
      id: route.id.toString(),
      title: route.title,
      description: route.description,
      start_location: route.start_location,
      start_lat: Number(route.start_lat),
      start_lng: Number(route.start_lng),
      end_location: route.end_location,
      end_lat: route.end_lat === null ? null : Number(route.end_lat),
      end_lng: route.end_lng === null ? null : Number(route.end_lng),
      city_code: route.city_code,
      district_code: route.district_code,
      total_distance: route.total_distance,
      estimated_time: route.estimated_time,
      difficulty: route.difficulty,
      images: Array.isArray(route.images) ? route.images : [],
      visibility: route.visibility,
      status: route.status,
      view_count: route.view_count,
      favorite_count: route.favorite_count,
      external_route_url: route.external_route_url,
      polyline_provider: route.polyline_provider,
      offlined_at: route.offlined_at?.toISOString() ?? null,
      offline_reason: route.offline_reason,
      offlined_by: route.offlined_by?.toString() ?? null,
      created_at: route.created_at.toISOString(),
      updated_at: route.updated_at.toISOString(),
      creator: {
        id: route.user.id.toString(),
        nickname: route.user.nickname,
        avatar_url: route.user.avatar_url,
        status: route.user.status,
      },
      points: route.points.map((point) => ({
        id: point.id.toString(),
        order: point.order,
        type: point.type,
        name: point.name,
        address: point.address,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        city_code: point.city_code,
        district_code: point.district_code,
      })),
      regions: route.regions.map((region) => ({
        city_code: region.city_code,
        district_code: region.district_code,
        has_start: region.has_start,
        has_waypoint: region.has_waypoint,
        point_count: region.point_count,
      })),
      linked_ride_ids: route.ride_links.map((link) => link.ride_id.toString()),
      counts: route._count,
    };
  }

  private auditSummary(route: AdminUserRouteRecord) {
    return {
      id: route.id.toString(),
      title: route.title,
      user_id: route.user_id.toString(),
      visibility: route.visibility,
      status: route.status,
      city_code: route.city_code,
    };
  }
}
