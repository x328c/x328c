import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AdminForumQueueQueryDto,
  AdminForumReportQueryDto,
  CreateUserRestrictionDto,
  ForumAuditQueryDto,
} from './dto';
import {
  FORUM_ERROR,
  FORUM_MODERATION_STATUS,
  FORUM_RESTRICTION_TYPE,
  ForumContentType,
} from './forum.constants';
import { ForumModerationMetricsService } from './forum-moderation-metrics.service';
import { ForumModerationService } from './forum-moderation.service';

type ModerationQueuePost = Prisma.ForumPostGetPayload<{
  include: {
    board: true;
    user: { select: { id: true; nickname: true; avatar_url: true } };
    images: { include: { file_record: true } };
  };
}>;
type ModerationQueueReply = Prisma.ForumReplyGetPayload<{
  include: {
    user: { select: { id: true; nickname: true; avatar_url: true } };
    post: { select: { id: true; title: true } };
  };
}>;

@Injectable()
export class AdminForumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ForumModerationService,
    private readonly metrics: ForumModerationMetricsService,
    private readonly operationLogs: OperationLogService,
  ) {}

  async moderationQueue(query: AdminForumQueueQueryDto) {
    const where = {
      moderation_status: FORUM_MODERATION_STATUS.PENDING,
      deleted_at: null,
      ...(query.queue === 'errors'
        ? { moderation_last_error_at: { not: null } }
        : { moderation_last_error_at: null }),
    };
    const take = query.page * query.pageSize;
    const [posts, replies, pendingCount, errorCount] = await Promise.all([
      query.type === 'reply'
        ? []
        : this.prisma.forumPost.findMany({
            where,
            include: {
              board: true,
              user: { select: { id: true, nickname: true, avatar_url: true } },
              images: { include: { file_record: true }, orderBy: { order: 'asc' } },
            },
            orderBy: { created_at: 'asc' },
            take,
          }),
      query.type === 'post'
        ? []
        : this.prisma.forumReply.findMany({
            where,
            include: {
              user: { select: { id: true, nickname: true, avatar_url: true } },
              post: { select: { id: true, title: true } },
            },
            orderBy: { created_at: 'asc' },
            take,
          }),
      this.pendingCount(false),
      this.pendingCount(true),
    ]);
    const combined = [
      ...posts.map((item) => this.queuePost(item)),
      ...replies.map((item) => this.queueReply(item)),
    ].sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
    const start = (query.page - 1) * query.pageSize;
    const list = combined.slice(start, start + query.pageSize);
    return {
      list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: combined.length < take ? start + combined.length : start + combined.length + 1,
      },
      counts: { pending: pendingCount, errors: errorCount },
      metrics: this.metrics.snapshot(),
    };
  }

  async reportQueue(query: AdminForumReportQueryDto) {
    const where: Prisma.ReportWhereInput = {
      deleted_at: null,
      OR: [
        { content_type: { in: ['forum_post', 'forum_reply'] } },
        {
          content_type: 'user',
          evidence_snapshot: { path: '$.source', equals: 'forum' },
        },
      ],
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, nickname: true } },
          reported_user: { select: { id: true, nickname: true } },
        },
        orderBy: { created_at: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        id: item.id.toString(),
        content_type: item.content_type,
        content_id: item.content_id?.toString() ?? null,
        reason: item.reason,
        description: item.description,
        evidence_snapshot: item.evidence_snapshot,
        status: item.status,
        reporter: { id: item.reporter.id.toString(), nickname: item.reporter.nickname },
        reported_user: item.reported_user
          ? { id: item.reported_user.id.toString(), nickname: item.reported_user.nickname }
          : null,
        created_at: item.created_at,
      })),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async boards() {
    const items = await this.prisma.forumBoard.findMany({
      where: { deleted_at: null },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return {
      items: items.map((item) => ({
        id: item.id.toString(),
        slug: item.slug,
        name: item.name,
        description: item.description,
        sort_order: item.sort_order,
        status: item.status,
      })),
    };
  }

  async restrictions() {
    const items = await this.prisma.userRestriction.findMany({
      where: { type: FORUM_RESTRICTION_TYPE, deleted_at: null, ends_at: { gt: new Date() } },
      include: {
        user: { select: { id: true, nickname: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { ends_at: 'asc' },
      take: 200,
    });
    return {
      items: items.map((item) => ({
        id: item.id.toString(),
        user: { id: item.user.id.toString(), nickname: item.user.nickname },
        reason: item.reason,
        starts_at: item.starts_at,
        ends_at: item.ends_at,
        creator: { id: item.creator.id.toString(), username: item.creator.username },
        created_at: item.created_at,
      })),
    };
  }

  async preview(type: ForumContentType, id: bigint) {
    if (type === 'post') {
      const post = await this.prisma.forumPost.findUnique({
        where: { id },
        include: {
          board: true,
          user: { select: { id: true, nickname: true, avatar_url: true } },
          images: { include: { file_record: true }, orderBy: { order: 'asc' } },
          replies: {
            where: { deleted_at: null },
            select: { id: true, status: true, moderation_status: true },
          },
        },
      });
      if (!post) throw new AppException(FORUM_ERROR.NOT_FOUND, '帖子不存在', HttpStatus.NOT_FOUND);
      return {
        type,
        id: post.id.toString(),
        title: post.title,
        content: post.content,
        content_format: post.content_format,
        board: { id: post.board.id.toString(), name: post.board.name },
        author: {
          id: post.user.id.toString(),
          nickname: post.user.nickname,
          avatar_url: post.user.avatar_url,
        },
        images: post.images.map((image) => ({
          id: image.id.toString(),
          url: image.file_record.cdn_url,
          moderation_status: image.moderation_status,
          moderation_reason: image.moderation_reason,
        })),
        status: post.status,
        moderation_status: post.moderation_status,
        moderation_reason: post.moderation_reason,
        error_code: post.moderation_last_error_code,
        attempts: post.moderation_attempts,
        manual_review_required: post.manual_review_required,
        created_at: post.created_at,
        published_at: post.published_at,
        offline_reason: post.offline_reason,
      };
    }
    const reply = await this.prisma.forumReply.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, avatar_url: true } },
        post: { select: { id: true, title: true } },
      },
    });
    if (!reply) throw new AppException(FORUM_ERROR.NOT_FOUND, '回复不存在', HttpStatus.NOT_FOUND);
    return {
      type,
      id: reply.id.toString(),
      content: reply.content,
      content_format: reply.content_format,
      post: { id: reply.post.id.toString(), title: reply.post.title },
      author: {
        id: reply.user.id.toString(),
        nickname: reply.user.nickname,
        avatar_url: reply.user.avatar_url,
      },
      status: reply.status,
      moderation_status: reply.moderation_status,
      moderation_reason: reply.moderation_reason,
      error_code: reply.moderation_last_error_code,
      attempts: reply.moderation_attempts,
      manual_review_required: reply.manual_review_required,
      created_at: reply.created_at,
      published_at: reply.published_at,
      offline_reason: reply.offline_reason,
    };
  }

  async approve(audit: OperationActorContext, type: ForumContentType, id: bigint, reason: string) {
    const before = await this.state(type, id);
    if (before.deleted_at || before.status !== 1 || before.moderation_status === 1)
      throw new AppException(
        FORUM_ERROR.INVALID_STATE,
        '内容当前状态不能人工通过',
        HttpStatus.CONFLICT,
      );
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (type === 'post') {
        await tx.forumPost.update({
          where: { id },
          data: {
            moderation_status: 1,
            moderation_reason: `人工通过：${reason}`,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
            manual_review_required: false,
            published_at: now,
          },
        });
        await tx.forumPostImage.updateMany({
          where: { post_id: id },
          data: {
            moderation_status: 1,
            moderation_reason: `人工通过：${reason}`,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
          },
        });
      } else {
        await tx.forumReply.update({
          where: { id },
          data: {
            moderation_status: 1,
            moderation_reason: `人工通过：${reason}`,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
            manual_review_required: false,
            published_at: now,
          },
        });
        await this.adjustReplyCount(tx, before.post_id!, 1);
      }
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: `forum.${type}.approve`,
        objectType: `forum_${type}`,
        objectId: id.toString(),
        reason,
        beforeSummary: this.summary(before),
        afterSummary: { status: 1, moderation_status: 1 },
      });
    });
    return { success: true };
  }

  async reject(audit: OperationActorContext, type: ForumContentType, id: bigint, reason: string) {
    const before = await this.state(type, id);
    if (before.deleted_at || before.status !== 1 || before.moderation_status === 1)
      throw new AppException(
        FORUM_ERROR.INVALID_STATE,
        '已发布内容请使用下架操作',
        HttpStatus.CONFLICT,
      );
    await this.prisma.$transaction(async (tx) => {
      const data = {
        moderation_status: 2,
        moderation_reason: reason,
        moderation_next_retry_at: null,
        moderation_last_error_code: null,
        moderation_last_error_at: null,
        manual_review_required: false,
        published_at: null,
      };
      if (type === 'post') {
        await tx.forumPost.update({ where: { id }, data });
        await tx.forumPostImage.updateMany({
          where: { post_id: id },
          data: { moderation_status: 2, moderation_reason: reason, moderation_next_retry_at: null },
        });
      } else await tx.forumReply.update({ where: { id }, data });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: `forum.${type}.reject`,
        objectType: `forum_${type}`,
        objectId: id.toString(),
        reason,
        beforeSummary: this.summary(before),
        afterSummary: { status: 1, moderation_status: 2 },
      });
    });
    return { success: true };
  }

  async offline(audit: OperationActorContext, type: ForumContentType, id: bigint, reason: string) {
    const before = await this.state(type, id);
    if (before.deleted_at || before.status !== 1)
      throw new AppException(FORUM_ERROR.INVALID_STATE, '内容已删除或下架', HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      const data = {
        status: 2,
        offlined_at: new Date(),
        offline_reason: reason,
        published_at: null,
      };
      if (type === 'post') await tx.forumPost.update({ where: { id }, data });
      else {
        await tx.forumReply.update({ where: { id }, data });
        if (before.moderation_status === 1) await this.adjustReplyCount(tx, before.post_id!, -1);
      }
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: `forum.${type}.offline`,
        objectType: `forum_${type}`,
        objectId: id.toString(),
        reason,
        beforeSummary: this.summary(before),
        afterSummary: { status: 2, moderation_status: before.moderation_status },
      });
    });
    return { success: true };
  }

  async retry(audit: OperationActorContext, type: ForumContentType, id: bigint, reason: string) {
    const before = await this.state(type, id);
    if (before.deleted_at || before.status !== 1 || before.moderation_status !== 0)
      throw new AppException(
        FORUM_ERROR.INVALID_STATE,
        '仅审核异常的待审内容可以重试',
        HttpStatus.CONFLICT,
      );
    const result = await this.moderation.forceRetry(type, id);
    await this.operationLogs.append({
      ...audit,
      action: `forum.${type}.retry`,
      objectType: `forum_${type}`,
      objectId: id.toString(),
      reason,
      beforeSummary: this.summary(before),
      afterSummary: { moderation_result: result },
    });
    return { success: true, result };
  }

  async restrictUser(audit: OperationActorContext, userId: bigint, dto: CreateUserRestrictionDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, status: true },
    });
    if (!user) throw new AppException(FORUM_ERROR.NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND);
    const startsAt = dto.starts_at ? new Date(dto.starts_at) : new Date();
    const endsAt = new Date(dto.ends_at);
    if (endsAt <= startsAt)
      throw new AppException(
        FORUM_ERROR.INVALID_STATE,
        '禁言结束时间必须晚于开始时间',
        HttpStatus.BAD_REQUEST,
      );
    let restrictionId = '';
    await this.prisma.$transaction(async (tx) => {
      const restriction = await tx.userRestriction.create({
        data: {
          user_id: userId,
          type: FORUM_RESTRICTION_TYPE,
          reason: dto.reason,
          starts_at: startsAt,
          ends_at: endsAt,
          created_by: audit.adminId,
        },
      });
      restrictionId = restriction.id.toString();
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'forum.user.mute',
        objectType: 'user_restriction',
        objectId: restrictionId,
        reason: dto.reason,
        afterSummary: {
          user_id: userId.toString(),
          starts_at: startsAt,
          ends_at: endsAt,
          type: FORUM_RESTRICTION_TYPE,
        },
      });
    });
    return { id: restrictionId, user_id: userId.toString(), starts_at: startsAt, ends_at: endsAt };
  }

  async unrestrictUser(
    audit: OperationActorContext,
    userId: bigint,
    restrictionId: bigint,
    reason: string,
  ) {
    const restriction = await this.prisma.userRestriction.findFirst({
      where: { id: restrictionId, user_id: userId, type: FORUM_RESTRICTION_TYPE, deleted_at: null },
    });
    if (!restriction)
      throw new AppException(FORUM_ERROR.NOT_FOUND, '有效禁言记录不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRestriction.update({
        where: { id: restrictionId },
        data: { deleted_at: new Date() },
      });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'forum.user.unmute',
        objectType: 'user_restriction',
        objectId: restrictionId.toString(),
        reason,
        beforeSummary: {
          user_id: userId.toString(),
          starts_at: restriction.starts_at,
          ends_at: restriction.ends_at,
        },
        afterSummary: { deleted: true },
      });
    });
    return { success: true };
  }

  async setBoardStatus(audit: OperationActorContext, id: bigint, status: number, reason: string) {
    const board = await this.prisma.forumBoard.findFirst({ where: { id, deleted_at: null } });
    if (!board) throw new AppException(FORUM_ERROR.NOT_FOUND, '板块不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.forumBoard.update({ where: { id }, data: { status } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: status === 1 ? 'forum.board.enable' : 'forum.board.disable',
        objectType: 'forum_board',
        objectId: id.toString(),
        reason,
        beforeSummary: { status: board.status },
        afterSummary: { status },
      });
    });
    return { id: id.toString(), status };
  }

  async auditLogs(query: ForumAuditQueryDto) {
    const where: Prisma.OperationLogWhereInput = {
      object_type: query.object_type
        ? query.object_type
        : { in: ['forum_post', 'forum_reply', 'forum_board', 'user_restriction', 'report'] },
      ...(query.object_id ? { object_id: query.object_id } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.operationLog.findMany({
        where,
        include: { admin: { select: { id: true, username: true } } },
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.operationLog.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        id: item.id.toString(),
        admin: { id: item.admin.id.toString(), username: item.admin.username },
        action: item.action,
        object_type: item.object_type,
        object_id: item.object_id,
        before_summary: item.before_summary,
        after_summary: item.after_summary,
        reason: item.reason,
        request_id: item.request_id,
        created_at: item.created_at,
      })),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  private async pendingCount(errors: boolean) {
    const clause = errors ? { not: null as Date | null } : null;
    const [posts, replies] = await Promise.all([
      this.prisma.forumPost.count({
        where: { moderation_status: 0, deleted_at: null, moderation_last_error_at: clause },
      }),
      this.prisma.forumReply.count({
        where: { moderation_status: 0, deleted_at: null, moderation_last_error_at: clause },
      }),
    ]);
    return posts + replies;
  }

  private async state(type: ForumContentType, id: bigint) {
    const value =
      type === 'post'
        ? await this.prisma.forumPost.findUnique({
            where: { id },
            select: { status: true, moderation_status: true, deleted_at: true },
          })
        : await this.prisma.forumReply.findUnique({
            where: { id },
            select: { status: true, moderation_status: true, deleted_at: true, post_id: true },
          });
    if (!value) throw new AppException(FORUM_ERROR.NOT_FOUND, '内容不存在', HttpStatus.NOT_FOUND);
    return value as {
      status: number;
      moderation_status: number;
      deleted_at: Date | null;
      post_id?: bigint;
    };
  }

  private summary(value: { status: number; moderation_status: number }) {
    return { status: value.status, moderation_status: value.moderation_status };
  }
  private queuePost(item: ModerationQueuePost) {
    return {
      type: 'post',
      id: item.id.toString(),
      title: item.title,
      content_preview: item.content.slice(0, 200),
      board: { id: item.board.id.toString(), name: item.board.name },
      author: { id: item.user.id.toString(), nickname: item.user.nickname },
      image_count: item.images.length,
      attempts: item.moderation_attempts,
      error_code: item.moderation_last_error_code,
      next_retry_at: item.moderation_next_retry_at,
      manual_review_required: item.manual_review_required,
      created_at: item.created_at,
    };
  }
  private queueReply(item: ModerationQueueReply) {
    return {
      type: 'reply',
      id: item.id.toString(),
      content_preview: item.content.slice(0, 200),
      post: { id: item.post.id.toString(), title: item.post.title },
      author: { id: item.user.id.toString(), nickname: item.user.nickname },
      image_count: 0,
      attempts: item.moderation_attempts,
      error_code: item.moderation_last_error_code,
      next_retry_at: item.moderation_next_retry_at,
      manual_review_required: item.manual_review_required,
      created_at: item.created_at,
    };
  }

  private async adjustReplyCount(tx: Prisma.TransactionClient, postId: bigint, delta: 1 | -1) {
    const post = await tx.forumPost.findUniqueOrThrow({
      where: { id: postId },
      select: { reply_count: true, like_count: true },
    });
    const count = Math.max(0, post.reply_count + delta);
    await tx.forumPost.update({
      where: { id: postId },
      data: { reply_count: count, hot_score: Math.min(999_999, post.like_count * 2 + count * 3) },
    });
  }
}
