import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateUserRouteDto,
  UpdateUserRouteDto,
  UserRouteMineQueryDto,
  UserRoutePublicQueryDto,
} from './dto/user-route.dto';

@Injectable()
export class UserRouteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: bigint, dto: CreateUserRouteDto) {
    this.assertEndLocation(dto);
    await this.assertImagesOwned(userId, dto.images ?? []);
    const optional = this.writeData(dto);
    const route = await this.prisma.userRoute.create({
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
    const cursor = query.cursor ? this.parseId(query.cursor) : undefined;
    const keyword = query.keyword?.normalize('NFKC').trim();
    const records = await this.prisma.userRoute.findMany({
      where: {
        visibility: 2,
        status: 1,
        ...(query.difficulty ? { difficulty: query.difficulty } : {}),
        ...(query.min_distance !== undefined || query.max_distance !== undefined
          ? {
              total_distance: {
                ...(query.min_distance !== undefined ? { gte: query.min_distance } : {}),
                ...(query.max_distance !== undefined ? { lte: query.max_distance } : {}),
              },
            }
          : {}),
        ...(keyword
          ? {
              OR: [
                { title: { contains: keyword } },
                { start_location: { contains: keyword } },
                { end_location: { contains: keyword } },
              ],
            }
          : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        user: true,
        ...(viewerId
          ? { favorites: { where: { user_id: viewerId }, select: { id: true }, take: 1 } }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return this.page(records, limit, viewerId);
  }

  async detail(id: bigint, viewerId?: bigint) {
    const route = await this.prisma.userRoute.findFirst({
      where: { id, status: 1 },
      include: {
        user: true,
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

  async update(userId: bigint, id: bigint, dto: UpdateUserRouteDto) {
    const current = await this.owned(userId, id);
    this.assertEndLocation({
      end_location: dto.end_location ?? current.end_location ?? undefined,
      end_lat: dto.end_lat ?? current.end_lat?.toNumber(),
      end_lng: dto.end_lng ?? current.end_lng?.toNumber(),
    });
    if (dto.images) await this.assertImagesOwned(userId, dto.images);
    const route = await this.prisma.userRoute.update({
      where: { id },
      data: this.writeData(dto),
      include: { user: true },
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
    });
    if (!route) throw new AppException(55001, '路线不存在或无权操作', HttpStatus.NOT_FOUND);
    return route;
  }

  private writeData(
    dto: UpdateUserRouteDto | CreateUserRouteDto,
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
  ) {
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((item) => this.serialize(item, viewerId));
    return { items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  private serialize(item: Record<string, unknown> & { id: bigint }, viewerId?: bigint) {
    const decimal = (value: unknown) =>
      value instanceof Prisma.Decimal ? value.toNumber() : value;
    const array = (value: unknown) => (Array.isArray(value) ? value : []);
    const user = item.user as { id: bigint; nickname: string; avatar_url: string | null };
    const favorites = item.favorites as Array<{ id: bigint }> | undefined;
    return {
      ...item,
      id: item.id.toString(),
      user_id: String(item.user_id),
      start_lat: decimal(item.start_lat),
      start_lng: decimal(item.start_lng),
      end_lat: decimal(item.end_lat),
      end_lng: decimal(item.end_lng),
      waypoints: array(item.waypoints),
      images: array(item.images),
      is_owner: viewerId !== undefined && BigInt(String(item.user_id)) === viewerId,
      is_favorited: Boolean(favorites?.length),
      creator: { id: user.id.toString(), nickname: user.nickname, avatar_url: user.avatar_url },
      user: undefined,
      favorites: undefined,
    };
  }

  private parseId(value: string) {
    if (!/^[1-9]\d*$/.test(value)) throw new AppException(1001, '无效游标');
    return BigInt(value);
  }
}
