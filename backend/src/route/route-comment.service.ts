import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminRouteCommentQueryDto, DeleteRouteCommentDto, RouteCommentListDto } from './dto';

const DANGEROUS =
  /(?:<\s*\/?\s*(?:script|iframe|object|embed|img|svg)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:)/i;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
@Injectable()
export class RouteCommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly logs: OperationLogService,
  ) {}

  async list(routeId: bigint, query: RouteCommentListDto, _viewerId?: bigint) {
    await this.flags.assertEnabled('route.comment_read_enabled');
    await this.assertPublicRoute(routeId);
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.parseId(query.cursor) : undefined;
    const records = await this.prisma.routeComment.findMany({
      where: {
        route_id: routeId,
        deleted_at: null,
        status: 1,
        published_at: { not: null },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: { user: true },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    await this.flags.assertEnabled('route.comment_read_enabled');
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((item) => this.serialize(item));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore };
  }

  async listUserRoute(userRouteId: bigint, query: RouteCommentListDto, _viewerId?: bigint) {
    await this.flags.assertEnabled('route.comment_read_enabled');
    await this.assertPublicUserRoute(userRouteId);
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.parseId(query.cursor) : undefined;
    const records = await this.prisma.routeComment.findMany({
      where: {
        user_route_id: userRouteId,
        deleted_at: null,
        status: 1,
        published_at: { not: null },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: { user: true },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((item) => this.serialize(item));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore };
  }

  async mine(userId: bigint, query: RouteCommentListDto) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.parseId(query.cursor) : undefined;
    const records = await this.prisma.routeComment.findMany({
      where: { user_id: userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: {
        user: true,
        route: { select: { id: true, title: true } },
        user_route: { select: { id: true, title: true } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((item) => ({
      ...this.serialize(item),
      route: item.route
        ? { id: item.route.id.toString(), title: item.route.title, type: 'platform' }
        : item.user_route
          ? { id: item.user_route.id.toString(), title: item.user_route.title, type: 'user' }
          : null,
    }));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore };
  }

  async create(
    userId: bigint,
    routeId: bigint,
    content: string,
    images: string[],
    idempotencyKey?: string,
  ) {
    await this.flags.assertEnabled('route.comment_enabled');
    await this.assertPublicRoute(routeId);
    return this.createRecord(userId, { route_id: routeId }, content, images, idempotencyKey);
  }

  private async createRecord(
    userId: bigint,
    target: { route_id: bigint } | { user_route_id: bigint },
    content: string,
    images: string[],
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new AppException(40002, 'Idempotency-Key 无效', HttpStatus.BAD_REQUEST);
    const sanitized = this.sanitize(content);
    await this.assertImagesOwned(userId, images);
    const submissionHash = this.submissionHash(sanitized, images);
    const old = await this.prisma.routeComment.findUnique({
      where: { user_id_idempotency_key: { user_id: userId, idempotency_key: idempotencyKey } },
      include: { user: true },
    });
    if (old) {
      if (old.content_hash !== submissionHash) {
        throw new AppException(40003, '同一幂等键不能用于不同评论内容', HttpStatus.CONFLICT);
      }
      return { ...this.serialize(old), replayed: true };
    }
    let record;
    try {
      record = await this.prisma.routeComment.create({
        data: {
          ...target,
          user_id: userId,
          content: sanitized,
          images,
          content_hash: submissionHash,
          idempotency_key: idempotencyKey,
          status: 1,
          moderation_status: 1,
          published_at: new Date(),
        },
        include: { user: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.routeComment.findUnique({
          where: { user_id_idempotency_key: { user_id: userId, idempotency_key: idempotencyKey } },
          include: { user: true },
        });
        if (replay) {
          if (replay.content_hash !== submissionHash) {
            throw new AppException(40003, '同一幂等键不能用于不同评论内容', HttpStatus.CONFLICT);
          }
          return { ...this.serialize(replay), replayed: true };
        }
      }
      throw error;
    }
    return { ...this.serialize(record), replayed: false };
  }

  async createForUserRoute(
    userId: bigint,
    userRouteId: bigint,
    content: string,
    images: string[],
    idempotencyKey?: string,
  ) {
    await this.flags.assertEnabled('route.comment_enabled');
    await this.assertPublicUserRoute(userRouteId);
    return this.createRecord(
      userId,
      { user_route_id: userRouteId },
      content,
      images,
      idempotencyKey,
    );
  }

  async update(userId: bigint, id: bigint, content: string, images?: string[]) {
    await this.flags.assertEnabled('route.comment_enabled');
    const current = await this.prisma.routeComment.findFirst({
      where: { id, user_id: userId, deleted_at: null },
    });
    if (!current) throw new AppException(54001, '评论不存在', HttpStatus.NOT_FOUND);
    const sanitized = this.sanitize(content);
    const nextImages = images ?? this.parseImages(current.images);
    await this.assertImagesOwned(userId, nextImages);
    await this.prisma.routeComment.update({
      where: { id },
      data: {
        content: sanitized,
        images: nextImages,
        content_hash: this.submissionHash(sanitized, nextImages),
        status: 1,
        moderation_status: 1,
        moderation_attempts: 0,
        next_retry_at: null,
        rejection_reason: null,
        published_at: new Date(),
      },
    });
    const updated = await this.prisma.routeComment.findUniqueOrThrow({
      where: { id },
      include: { user: true },
    });
    return this.serialize(updated);
  }

  async remove(userId: bigint, id: bigint) {
    const record = await this.prisma.routeComment.findFirst({ where: { id, user_id: userId } });
    if (!record || record.deleted_at) return { success: true, idempotent: true };
    await this.prisma.routeComment.update({
      where: { id },
      data: { deleted_at: new Date(), published_at: null },
    });
    return { success: true, idempotent: false };
  }

  async adminList(query: AdminRouteCommentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { deleted_at: null };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.routeComment.findMany({
        where,
        include: { user: true, route: true, user_route: true },
        orderBy: query.report_order
          ? [{ report_count: query.report_order }, { created_at: 'desc' }]
          : { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.routeComment.count({ where }),
    ]);
    return {
      list: list.map((item) => ({
        ...this.serialize(item),
        report_count: item.report_count,
        reported_at: item.reported_at,
        route: item.route
          ? { id: item.route.id.toString(), title: item.route.title, type: 'platform' }
          : item.user_route
            ? { id: item.user_route.id.toString(), title: item.user_route.title, type: 'user' }
            : null,
      })),
      pagination: { page, pageSize, total },
    };
  }

  async adminRemove(id: bigint, dto: DeleteRouteCommentDto, actor: OperationActorContext) {
    const current = await this.prisma.routeComment.findFirst({ where: { id, deleted_at: null } });
    if (!current) throw new AppException(54001, '评论不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.routeComment.update({
        where: { id },
        data: { deleted_at: new Date(), published_at: null, offline_reason: dto.reason },
      });
      await tx.report.updateMany({
        where: {
          content_type: 'route_comment',
          content_id: id,
          status: 0,
          deleted_at: null,
        },
        data: {
          status: 1,
          handled_by: actor.adminId,
          handled_at: new Date(),
          handling_note: dto.reason,
        },
      });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'route_comment.delete',
        objectType: 'route_comment',
        objectId: id.toString(),
        reason: dto.reason,
        beforeSummary: { status: current.status, moderation_status: current.moderation_status },
        afterSummary: { deleted: true },
      });
    });
    return { success: true };
  }

  async retryDue(_limit = 20): Promise<{ retried: number }> {
    return { retried: 0 };
  }

  private async assertPublicRoute(id: bigint) {
    const route = await this.prisma.route.findFirst({
      where: { id, status: 1, deleted_at: null },
      select: { id: true },
    });
    if (!route) throw new AppException(53001, '路线不存在或已下架', HttpStatus.NOT_FOUND);
  }
  private async assertPublicUserRoute(id: bigint) {
    const route = await this.prisma.userRoute.findFirst({
      where: { id, visibility: 2, status: 1 },
      select: { id: true },
    });
    if (!route) throw new AppException(55001, '公开路线不存在', HttpStatus.NOT_FOUND);
  }
  private sanitize(value: string) {
    const content = value.normalize('NFKC').replace(CONTROL, '').trim();
    if (DANGEROUS.test(content)) throw new AppException(54003, '评论包含不支持的标签或危险协议');
    return content.replace(/<[^>]*>/g, '').trim();
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private submissionHash(content: string, images: string[]) {
    return images.length ? this.hash(JSON.stringify({ content, images })) : this.hash(content);
  }
  private async assertImagesOwned(userId: bigint, images: string[]) {
    if (!images.length) return;
    if (images.length > 2) {
      throw new AppException(54004, '每条评论最多上传 2 张图片', HttpStatus.BAD_REQUEST);
    }
    const uniqueImages = [...new Set(images)];
    const records = await this.prisma.fileRecord.findMany({
      where: {
        user_id: userId,
        cdn_url: { in: uniqueImages },
        file_key: { startsWith: 'route-comments/' },
      },
      select: { cdn_url: true },
    });
    if (records.length !== uniqueImages.length) {
      throw new AppException(54005, '评论图片无效或不属于当前用户', HttpStatus.BAD_REQUEST);
    }
  }
  private parseImages(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string').slice(0, 2);
  }
  private parseId(value: string) {
    if (!/^[1-9]\d*$/.test(value)) throw new AppException(1001, '无效游标');
    return BigInt(value);
  }
  private serialize(item: {
    id: bigint;
    content: string;
    images: Prisma.JsonValue | null;
    report_count: number;
    reported_at: Date | null;
    status: number;
    moderation_status: number;
    rejection_reason: string | null;
    offline_reason: string | null;
    published_at: Date | null;
    created_at: Date;
    deleted_at: Date | null;
    user: { id: bigint; nickname: string; avatar_url: string | null };
  }) {
    return {
      id: item.id.toString(),
      content: item.content,
      images: this.parseImages(item.images),
      status: item.deleted_at ? 'DELETED' : 'PUBLISHED',
      rejection_reason: item.rejection_reason,
      offline_reason: item.offline_reason,
      published_at: item.published_at,
      created_at: item.created_at,
      author: {
        id: item.user.id.toString(),
        nickname: item.user.nickname,
        avatar_url: item.user.avatar_url,
      },
    };
  }
}
