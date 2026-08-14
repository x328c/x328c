import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminReportQueryDto, CreateReportDto, HandleReportDto } from './dto';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { createHash } from 'crypto';
import { RateLimitService } from '../common/resilience/rate-limit.service';
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogs: OperationLogService,
    private readonly rateLimits: RateLimitService,
  ) {}
  async create(reporterId: bigint, ip: string, dto: CreateReportDto) {
    if (dto.content_type.startsWith('forum_') || dto.content_type === 'route_comment') {
      await this.rateLimits.consume({
        scope: 'forum.report.minute',
        subject: `${reporterId.toString()}:${ip}`,
        limit: 10,
        windowSeconds: 60,
      });
    }
    const contentId = BigInt(dto.content_id);
    let data: Prisma.ReportCreateInput;
    if (dto.content_type === 'ride') {
      const ride = await this.prisma.ride.findFirst({ where: { id: contentId, deleted_at: null } });
      if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
      data = {
        reporter: { connect: { id: reporterId } },
        ride: { connect: { id: contentId } },
        content_type: 'ride',
        content_id: contentId,
        reason: dto.reason,
        description: dto.description,
      };
    } else if (dto.content_type === 'activity') {
      const activity = await this.prisma.activity.findFirst({
        where: { id: contentId, deleted_at: null },
      });
      if (!activity) throw new AppException(4001, '活动不存在', HttpStatus.NOT_FOUND);
      data = {
        reporter: { connect: { id: reporterId } },
        activity: { connect: { id: contentId } },
        content_type: 'activity',
        content_id: contentId,
        reason: dto.reason,
        description: dto.description,
      };
    } else if (dto.content_type === 'forum_post') {
      const post = await this.prisma.forumPost.findFirst({
        where: {
          id: contentId,
          status: 1,
          moderation_status: 1,
          published_at: { not: null },
          deleted_at: null,
          board: { status: 1, deleted_at: null },
        },
        select: { id: true, user_id: true, title: true, status: true, moderation_status: true },
      });
      if (!post) throw new AppException(53001, '帖子不存在或已失效', HttpStatus.NOT_FOUND);
      if (post.user_id === reporterId) throw new AppException(1001, '不能举报自己的帖子');
      data = {
        reporter: { connect: { id: reporterId } },
        reported_user: { connect: { id: post.user_id } },
        content_type: 'forum_post',
        content_id: post.id,
        reason: dto.reason,
        description: dto.description,
        evidence_snapshot: {
          source: 'forum',
          target_type: 'post',
          target_id: post.id.toString(),
          author_id: post.user_id.toString(),
          title: post.title.slice(0, 50),
          title_hash: this.digest(post.title),
          status: post.status,
          moderation_status: post.moderation_status,
          captured_at: new Date().toISOString(),
        },
      };
    } else if (dto.content_type === 'forum_reply') {
      const reply = await this.prisma.forumReply.findFirst({
        where: {
          id: contentId,
          status: 1,
          moderation_status: 1,
          published_at: { not: null },
          deleted_at: null,
          post: {
            status: 1,
            moderation_status: 1,
            published_at: { not: null },
            deleted_at: null,
            board: { status: 1, deleted_at: null },
          },
        },
        select: {
          id: true,
          post_id: true,
          user_id: true,
          content: true,
          status: true,
          moderation_status: true,
        },
      });
      if (!reply) throw new AppException(53001, '回复不存在或已失效', HttpStatus.NOT_FOUND);
      if (reply.user_id === reporterId) throw new AppException(1001, '不能举报自己的回复');
      data = {
        reporter: { connect: { id: reporterId } },
        reported_user: { connect: { id: reply.user_id } },
        content_type: 'forum_reply',
        content_id: reply.id,
        reason: dto.reason,
        description: dto.description,
        evidence_snapshot: {
          source: 'forum',
          target_type: 'reply',
          target_id: reply.id.toString(),
          post_id: reply.post_id.toString(),
          author_id: reply.user_id.toString(),
          content_hash: this.digest(reply.content),
          status: reply.status,
          moderation_status: reply.moderation_status,
          captured_at: new Date().toISOString(),
        },
      };
    } else if (dto.content_type === 'route_comment') {
      const comment = await this.prisma.routeComment.findFirst({
        where: {
          id: contentId,
          status: 1,
          published_at: { not: null },
          deleted_at: null,
          OR: [
            { route: { status: 1, deleted_at: null } },
            { user_route: { visibility: 2, status: 1 } },
          ],
        },
        select: {
          id: true,
          route_id: true,
          user_route_id: true,
          user_id: true,
          content: true,
          status: true,
          report_count: true,
          moderation_status: true,
        },
      });
      if (!comment) throw new AppException(54001, '评论不存在或已失效', HttpStatus.NOT_FOUND);
      if (comment.user_id === reporterId) throw new AppException(1001, '不能举报自己的评论');
      const dedupeKey = `route-comment:${reporterId.toString()}:${comment.id.toString()}`;
      const existing = await this.prisma.report.findUnique({
        where: { route_comment_dedupe_key: dedupeKey },
      });
      if (existing) {
        return { id: existing.id.toString(), status: existing.status, replayed: true };
      }
      try {
        const report = await this.prisma.$transaction(async (tx) => {
          const created = await tx.report.create({
            data: {
              reporter: { connect: { id: reporterId } },
              reported_user: { connect: { id: comment.user_id } },
              content_type: 'route_comment',
              content_id: comment.id,
              route_comment_dedupe_key: dedupeKey,
              reason: dto.reason,
              description: dto.description,
              evidence_snapshot: {
                source: 'route',
                target_type: 'route_comment',
                target_id: comment.id.toString(),
                route_id: comment.route_id?.toString() ?? null,
                user_route_id: comment.user_route_id?.toString() ?? null,
                author_id: comment.user_id.toString(),
                content_hash: this.digest(comment.content),
                status: comment.status,
                report_count: comment.report_count,
                captured_at: new Date().toISOString(),
              },
            },
          });
          await tx.routeComment.update({
            where: { id: comment.id },
            data: { report_count: { increment: 1 }, reported_at: new Date() },
          });
          return created;
        });
        return { id: report.id.toString(), status: report.status, replayed: false };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const replay = await this.prisma.report.findUnique({
            where: { route_comment_dedupe_key: dedupeKey },
          });
          if (replay) return { id: replay.id.toString(), status: replay.status, replayed: true };
        }
        throw error;
      }
    } else {
      const user = await this.prisma.user.findFirst({ where: { id: contentId, deleted_at: null } });
      if (!user) throw new AppException(8001, '用户不存在', HttpStatus.NOT_FOUND);
      if (contentId === reporterId) throw new AppException(1001, '不能举报自己');
      data = {
        reporter: { connect: { id: reporterId } },
        reported_user: { connect: { id: contentId } },
        content_type: 'user',
        content_id: contentId,
        reason: dto.reason,
        description: dto.description,
        ...(dto.source === 'forum'
          ? {
              evidence_snapshot: {
                source: 'forum',
                target_type: 'user',
                target_id: user.id.toString(),
                user_status: user.status,
                captured_at: new Date().toISOString(),
              },
            }
          : {}),
      };
    }
    const report = await this.prisma.report.create({ data });
    return { id: report.id.toString(), status: report.status };
  }
  async list(query: AdminReportQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ReportWhereInput = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.content_type ? { content_type: query.content_type } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        include: { reporter: true, reported_user: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      list: items.map((x) => ({
        id: x.id.toString(),
        content_type: x.content_type,
        content_id: x.content_id?.toString() ?? null,
        reason: x.reason,
        description: x.description,
        evidence_snapshot: x.evidence_snapshot,
        status: x.status,
        reporter: { id: x.reporter.id.toString(), nickname: x.reporter.nickname },
        reported_user: x.reported_user
          ? { id: x.reported_user.id.toString(), nickname: x.reported_user.nickname }
          : null,
        created_at: x.created_at,
      })),
      pagination: { page, pageSize, total },
    };
  }
  async handle(audit: OperationActorContext, id: bigint, dto: HandleReportDto) {
    const report = await this.prisma.report.findFirst({ where: { id, deleted_at: null } });
    if (!report) throw new AppException(8003, '举报不存在', HttpStatus.NOT_FOUND);
    if (report.status !== 0) throw new AppException(1001, '举报已处理');
    if (
      (report.content_type.startsWith('forum_') || report.content_type === 'route_comment') &&
      !dto.handling_note?.trim()
    ) {
      throw new AppException(53009, 'UGC 举报处置原因必填', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.action === 'offline') {
        if (report.content_type === 'ride' && report.ride_id)
          await tx.ride.update({
            where: { id: report.ride_id },
            data: { status: 5, audit_status: 2 },
          });
        if (report.content_type === 'activity' && report.activity_id)
          await tx.activity.update({ where: { id: report.activity_id }, data: { status: 5 } });
        if (report.content_type === 'forum_post' && report.content_id)
          await tx.forumPost.update({
            where: { id: report.content_id },
            data: {
              status: 2,
              published_at: null,
              offlined_at: new Date(),
              offline_reason: dto.handling_note ?? '举报处置下架',
            },
          });
        if (report.content_type === 'forum_reply' && report.content_id) {
          const reply = await tx.forumReply.findUniqueOrThrow({ where: { id: report.content_id } });
          await tx.forumReply.update({
            where: { id: report.content_id },
            data: {
              status: 2,
              published_at: null,
              offlined_at: new Date(),
              offline_reason: dto.handling_note ?? '举报处置下架',
            },
          });
          if (reply.status === 1 && reply.moderation_status === 1 && !reply.deleted_at) {
            const post = await tx.forumPost.findUniqueOrThrow({ where: { id: reply.post_id } });
            const replyCount = Math.max(0, post.reply_count - 1);
            await tx.forumPost.update({
              where: { id: reply.post_id },
              data: {
                reply_count: replyCount,
                hot_score: Math.min(999_999, post.like_count * 2 + replyCount * 3),
              },
            });
          }
        }
        if (report.content_type === 'route_comment' && report.content_id)
          await tx.routeComment.update({
            where: { id: report.content_id },
            data: {
              deleted_at: new Date(),
              published_at: null,
              offline_reason: dto.handling_note ?? '举报处置下架',
            },
          });
      }
      if (dto.action === 'ban') {
        const userId =
          report.reported_user_id ??
          (report.content_type === 'ride' && report.ride_id
            ? (await tx.ride.findUniqueOrThrow({ where: { id: report.ride_id } })).user_id
            : report.content_type === 'activity' && report.activity_id
              ? (await tx.activity.findUniqueOrThrow({ where: { id: report.activity_id } })).user_id
              : report.content_type === 'forum_post' && report.content_id
                ? (await tx.forumPost.findUniqueOrThrow({ where: { id: report.content_id } }))
                    .user_id
                : report.content_type === 'forum_reply' && report.content_id
                  ? (await tx.forumReply.findUniqueOrThrow({ where: { id: report.content_id } }))
                      .user_id
                  : null);
        if (!userId) throw new AppException(8001, '无法确定被处理用户');
        await tx.user.update({ where: { id: userId }, data: { status: 0 } });
      }
      await tx.report.update({
        where: { id },
        data: {
          status: dto.action === 'ignore' ? 2 : 1,
          handled_by: audit.adminId,
          handled_at: new Date(),
          handling_note: dto.handling_note ?? dto.action,
        },
      });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: `report.handle.${dto.action}`,
        objectType: 'report',
        objectId: id.toString(),
        reason: dto.handling_note ?? dto.action,
        beforeSummary: { status: report.status },
        afterSummary: { status: dto.action === 'ignore' ? 2 : 1 },
      });
    });
    return { success: true, status: dto.action === 'ignore' ? 2 : 1 };
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
