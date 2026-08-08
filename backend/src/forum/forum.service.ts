import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { IdempotencyService } from '../common/resilience/idempotency.service';
import { RateLimitService } from '../common/resilience/rate-limit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateForumPostDto,
  CreateForumReplyDto,
  ForumCursorQueryDto,
  ForumPostListQueryDto,
  UpdateForumPostDto,
} from './dto';
import { ForumAccessService } from './forum-access.service';
import { ForumConfigService } from './forum-config.service';
import {
  FORUM_BOARD_STATUS,
  FORUM_CONTENT_STATUS,
  FORUM_ERROR,
  FORUM_LIKE_TARGET,
  FORUM_MODERATION_STATUS,
} from './forum.constants';
import { ForumContentSanitizer } from './forum-content-sanitizer';
import { ForumModerationService } from './forum-moderation.service';

interface LatestCursor {
  kind: 'latest';
  publishedAt: string;
  id: string;
}
interface HotCursor {
  kind: 'hot';
  score: string;
  publishedAt: string;
  id: string;
}
type ForumCursor = LatestCursor | HotCursor;
type PublicForumPost = Prisma.ForumPostGetPayload<{
  include: {
    board: { select: { id: true; slug: true; name: true; status: true } };
    user: { select: { id: true; nickname: true; avatar_url: true } };
    images: {
      include: { file_record: { select: { id: true; cdn_url: true; file_type: true } } };
    };
  };
}>;
type PublicForumReply = Prisma.ForumReplyGetPayload<{
  include: { user: { select: { id: true; nickname: true; avatar_url: true } } };
}>;

@Injectable()
export class ForumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ForumAccessService,
    private readonly config: ForumConfigService,
    private readonly rateLimits: RateLimitService,
    private readonly idempotency: IdempotencyService,
    private readonly sanitizer: ForumContentSanitizer,
    private readonly moderation: ForumModerationService,
  ) {}

  async boards(userId?: bigint) {
    const [boards, capability] = await Promise.all([
      this.prisma.forumBoard.findMany({
        where: { status: FORUM_BOARD_STATUS.ACTIVE, deleted_at: null },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.access.capability(userId),
    ]);
    return {
      items: boards.map((board) => ({
        id: board.id.toString(),
        slug: board.slug,
        name: board.name,
        description: board.description,
        sort_order: board.sort_order,
      })),
      capability,
    };
  }

  async listPosts(query: ForumPostListQueryDto, userId?: bigint) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor, query.sort) : undefined;
    const where: Prisma.ForumPostWhereInput = {
      status: FORUM_CONTENT_STATUS.ACTIVE,
      moderation_status: FORUM_MODERATION_STATUS.APPROVED,
      published_at: { not: null },
      deleted_at: null,
      board: { status: FORUM_BOARD_STATUS.ACTIVE, deleted_at: null },
      ...(query.board_id ? { board_id: BigInt(query.board_id) } : {}),
      ...(cursor ? this.postCursorWhere(cursor) : {}),
    };
    const orderBy: Prisma.ForumPostOrderByWithRelationInput[] =
      query.sort === 'hot'
        ? [{ hot_score: 'desc' }, { published_at: 'desc' }, { id: 'desc' }]
        : [{ published_at: 'desc' }, { id: 'desc' }];
    const rows = await this.prisma.forumPost.findMany({
      where,
      include: this.publicInclude(),
      orderBy,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const liked = await this.likedIds(
      userId,
      page.map((item) => item.id),
    );
    const last = page.at(-1);
    return {
      items: page.map((post) => this.toPost(post, liked.has(post.id.toString()), false)),
      hasMore,
      nextCursor: hasMore && last ? this.encodeCursor(last, query.sort) : null,
    };
  }

  async postDetail(id: bigint, userId?: bigint) {
    const post = await this.prisma.forumPost.findFirst({
      where: {
        id,
        status: FORUM_CONTENT_STATUS.ACTIVE,
        moderation_status: FORUM_MODERATION_STATUS.APPROVED,
        published_at: { not: null },
        deleted_at: null,
        board: { status: FORUM_BOARD_STATUS.ACTIVE, deleted_at: null },
      },
      include: this.publicInclude(),
    });
    if (post) {
      const liked = await this.likedIds(userId, [id]);
      return this.toPost(post, liked.has(id.toString()), true);
    }
    const hidden = await this.prisma.forumPost.findUnique({
      where: { id },
      select: {
        user_id: true,
        status: true,
        moderation_status: true,
        moderation_reason: true,
        deleted_at: true,
        offline_reason: true,
      },
    });
    if (!hidden) throw new AppException(FORUM_ERROR.NOT_FOUND, '帖子不存在', HttpStatus.NOT_FOUND);
    if (hidden.deleted_at || hidden.status === FORUM_CONTENT_STATUS.OFFLINE) {
      throw new AppException(
        FORUM_ERROR.OFFLINE,
        hidden.offline_reason || '帖子已失效或下架',
        HttpStatus.GONE,
      );
    }
    if (!userId || hidden.user_id !== userId) {
      throw new AppException(FORUM_ERROR.NOT_FOUND, '帖子不存在', HttpStatus.NOT_FOUND);
    }
    if (hidden.moderation_status === FORUM_MODERATION_STATUS.REJECTED) {
      throw new AppException(
        FORUM_ERROR.REJECTED,
        hidden.moderation_reason || '帖子审核未通过',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    throw new AppException(FORUM_ERROR.PENDING, '帖子正在审核中', HttpStatus.CONFLICT);
  }

  async myPosts(userId: bigint) {
    await this.access.assertActiveUser(userId);
    const items = await this.prisma.forumPost.findMany({
      where: { user_id: userId, deleted_at: null },
      include: this.publicInclude(),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return { items: items.map((post) => this.toPost(post, false, true)) };
  }

  async createPost(userId: bigint, ip: string, key: string, dto: CreateForumPostDto) {
    await this.access.assertCanPublish(userId);
    const title = this.sanitizer.sanitize(dto.title);
    const content = this.sanitizer.sanitize(dto.content);
    this.assertLength(title, 5, 50, '标题');
    this.assertLength(content, 10, 3000, '正文');
    const boardId = BigInt(dto.board_id);
    await this.assertBoardActive(boardId);
    const imageIds = dto.image_ids.map(BigInt);
    const payload = { board_id: dto.board_id, title, content, image_ids: dto.image_ids };
    const submissionHash = this.hash(payload);
    const replay = await this.prisma.forumPost.findUnique({
      where: { user_id_idempotency_key: { user_id: userId, idempotency_key: key } },
      select: { id: true, submission_hash: true },
    });
    if (replay) {
      if (replay.submission_hash !== submissionHash)
        throw new AppException(40901, '幂等键已用于不同请求', HttpStatus.CONFLICT);
      return {
        id: replay.id.toString(),
        replayed: true,
        state: await this.ownerPostState(replay.id),
      };
    }
    const files = await this.validateImages(userId, imageIds);
    await this.consumePostLimits(userId, ip);
    const result = await this.idempotency.execute(
      { scope: 'forum.post.create', actorKey: userId.toString(), key, payload },
      async () => {
        let postId: bigint;
        try {
          const post = await this.prisma.forumPost.create({
            data: {
              board_id: boardId,
              user_id: userId,
              title,
              content,
              status: FORUM_CONTENT_STATUS.ACTIVE,
              moderation_status: FORUM_MODERATION_STATUS.PENDING,
              idempotency_key: key,
              submission_hash: submissionHash,
              images: { create: files.map((file, order) => ({ file_record_id: file.id, order })) },
            },
            select: { id: true },
          });
          postId = post.id;
        } catch (error) {
          if (!this.isUniqueViolation(error)) throw error;
          const existing = await this.prisma.forumPost.findUnique({
            where: { user_id_idempotency_key: { user_id: userId, idempotency_key: key } },
            select: { id: true, submission_hash: true },
          });
          if (!existing || existing.submission_hash !== submissionHash) {
            throw new AppException(40901, '幂等键已用于不同请求', HttpStatus.CONFLICT);
          }
          return { id: existing.id.toString(), replayed: true };
        }
        await this.moderation.moderatePost(postId);
        return { id: postId.toString(), replayed: false };
      },
    );
    return {
      ...result.value,
      replayed: result.replayed || result.value.replayed,
      state: await this.ownerPostState(BigInt(result.value.id)),
    };
  }

  async updatePost(userId: bigint, id: bigint, ip: string, key: string, dto: UpdateForumPostDto) {
    await this.access.assertCanPublish(userId);
    const current = await this.prisma.forumPost.findFirst({
      where: { id, user_id: userId, deleted_at: null },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    if (!current) throw new AppException(FORUM_ERROR.NOT_FOUND, '帖子不存在', HttpStatus.NOT_FOUND);
    if (
      current.status !== FORUM_CONTENT_STATUS.ACTIVE ||
      ![0, 2].includes(current.moderation_status)
    ) {
      throw new AppException(
        FORUM_ERROR.INVALID_STATE,
        '仅待审核或已驳回的本人帖子可以编辑',
        HttpStatus.CONFLICT,
      );
    }
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new AppException(
        FORUM_ERROR.INVALID_CONTENT,
        '至少需要修改一个字段',
        HttpStatus.BAD_REQUEST,
      );
    }
    const boardId = dto.board_id ? BigInt(dto.board_id) : current.board_id;
    await this.assertBoardActive(boardId);
    const title = this.sanitizer.sanitize(dto.title ?? current.title);
    const content = this.sanitizer.sanitize(dto.content ?? current.content);
    this.assertLength(title, 5, 50, '标题');
    this.assertLength(content, 10, 3000, '正文');
    const imageIds =
      dto.image_ids?.map(BigInt) ?? current.images.map((image) => image.file_record_id);
    const files = await this.validateImages(userId, imageIds, id);
    const payload = {
      id: id.toString(),
      board_id: boardId.toString(),
      title,
      content,
      image_ids: imageIds.map(String),
    };
    const submissionHash = this.hash(payload);
    await this.consumePostLimits(userId, ip);
    const result = await this.idempotency.execute(
      { scope: 'forum.post.update', actorKey: userId.toString(), key, payload },
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.forumPostImage.deleteMany({ where: { post_id: id } });
          await tx.forumPost.update({
            where: { id },
            data: {
              board_id: boardId,
              title,
              content,
              submission_hash: submissionHash,
              moderation_status: 0,
              moderation_reason: null,
              moderation_attempts: 0,
              moderation_version: { increment: 1 },
              moderation_next_retry_at: null,
              moderation_last_error_code: null,
              moderation_last_error_at: null,
              manual_review_required: false,
              published_at: null,
              images: { create: files.map((file, order) => ({ file_record_id: file.id, order })) },
            },
          });
        });
        await this.moderation.moderatePost(id);
        return { id: id.toString() };
      },
    );
    return { ...result.value, replayed: result.replayed, state: await this.ownerPostState(id) };
  }

  async deletePost(userId: bigint, id: bigint) {
    await this.access.assertActiveUser(userId);
    const post = await this.prisma.forumPost.findFirst({
      where: { id, user_id: userId, deleted_at: null },
    });
    if (!post) throw new AppException(FORUM_ERROR.NOT_FOUND, '帖子不存在', HttpStatus.NOT_FOUND);
    await this.prisma.forumPost.update({
      where: { id },
      data: { deleted_at: new Date(), published_at: null },
    });
    return { success: true };
  }

  async listReplies(postId: bigint, query: ForumCursorQueryDto) {
    await this.assertPublicPost(postId);
    const cursor = query.cursor ? this.decodeReplyCursor(query.cursor) : undefined;
    const rows = await this.prisma.forumReply.findMany({
      where: {
        post_id: postId,
        status: 1,
        moderation_status: 1,
        published_at: { not: null },
        deleted_at: null,
        ...(cursor
          ? {
              OR: [
                { published_at: { gt: new Date(cursor.publishedAt) } },
                { published_at: new Date(cursor.publishedAt), id: { gt: BigInt(cursor.id) } },
              ],
            }
          : {}),
      },
      include: { user: { select: { id: true, nickname: true, avatar_url: true } } },
      orderBy: [{ published_at: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((reply) => this.toReply(reply)),
      hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                publishedAt: last.published_at!.toISOString(),
                id: last.id.toString(),
              }),
            ).toString('base64url')
          : null,
    };
  }

  async myReplies(userId: bigint) {
    await this.access.assertActiveUser(userId);
    const items = await this.prisma.forumReply.findMany({
      where: { user_id: userId, deleted_at: null },
      include: {
        user: { select: { id: true, nickname: true, avatar_url: true } },
        post: { select: { id: true, title: true, status: true, deleted_at: true } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return {
      items: items.map((reply) => ({
        ...this.toReply(reply),
        post: {
          id: reply.post.id.toString(),
          title: reply.post.title,
          available: reply.post.status === 1 && !reply.post.deleted_at,
        },
      })),
    };
  }

  async createReply(
    userId: bigint,
    postId: bigint,
    ip: string,
    key: string,
    dto: CreateForumReplyDto,
  ) {
    await this.access.assertCanPublish(userId);
    await this.assertPublicPost(postId);
    const content = this.sanitizer.sanitize(dto.content);
    this.assertLength(content, 1, 1000, '回复');
    const payload = { post_id: postId.toString(), content };
    const submissionHash = this.hash(payload);
    const replay = await this.prisma.forumReply.findUnique({
      where: { user_id_idempotency_key: { user_id: userId, idempotency_key: key } },
      select: { id: true, submission_hash: true },
    });
    if (replay) {
      if (replay.submission_hash !== submissionHash)
        throw new AppException(40901, '幂等键已用于不同请求', HttpStatus.CONFLICT);
      return {
        id: replay.id.toString(),
        replayed: true,
        state: await this.ownerReplyState(replay.id),
      };
    }
    await this.consumeReplyLimits(userId, ip);
    const result = await this.idempotency.execute(
      { scope: 'forum.reply.create', actorKey: userId.toString(), key, payload },
      async () => {
        let replyId: bigint;
        try {
          const reply = await this.prisma.forumReply.create({
            data: {
              post_id: postId,
              user_id: userId,
              content,
              idempotency_key: key,
              submission_hash: submissionHash,
            },
            select: { id: true },
          });
          replyId = reply.id;
        } catch (error) {
          if (!this.isUniqueViolation(error)) throw error;
          const existing = await this.prisma.forumReply.findUnique({
            where: { user_id_idempotency_key: { user_id: userId, idempotency_key: key } },
            select: { id: true, submission_hash: true },
          });
          if (!existing || existing.submission_hash !== submissionHash)
            throw new AppException(40901, '幂等键已用于不同请求', HttpStatus.CONFLICT);
          return { id: existing.id.toString(), replayed: true };
        }
        await this.moderation.moderateReply(replyId);
        return { id: replyId.toString(), replayed: false };
      },
    );
    return {
      ...result.value,
      replayed: result.replayed || result.value.replayed,
      state: await this.ownerReplyState(BigInt(result.value.id)),
    };
  }

  async deleteReply(userId: bigint, id: bigint) {
    await this.access.assertActiveUser(userId);
    const reply = await this.prisma.forumReply.findFirst({
      where: { id, user_id: userId, deleted_at: null },
    });
    if (!reply) throw new AppException(FORUM_ERROR.NOT_FOUND, '回复不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.forumReply.update({
        where: { id },
        data: { deleted_at: new Date(), published_at: null },
      });
      if (reply.moderation_status === 1 && reply.status === 1)
        await this.adjustReplyCount(tx, reply.post_id, -1);
    });
    return { success: true };
  }

  async likePost(userId: bigint, postId: bigint, ip: string) {
    await this.access.assertCanInteract(userId);
    await this.assertPublicPost(postId);
    const rates = await this.config.rates();
    await this.rateLimits.consume({
      scope: 'forum.like.minute',
      subject: `${userId.toString()}:${ip}`,
      limit: rates.likeMinute,
      windowSeconds: 60,
    });
    const result = await this.prisma.$transaction(async (tx) => {
      let created = false;
      try {
        await tx.forumLike.create({
          data: { user_id: userId, target_type: FORUM_LIKE_TARGET, target_id: postId },
        });
        created = true;
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
      if (created)
        await tx.forumPost.update({
          where: { id: postId },
          data: { like_count: { increment: 1 } },
        });
      return this.recomputePostCounts(tx, postId);
    });
    return { liked: true, like_count: result.like_count };
  }

  async unlikePost(userId: bigint, postId: bigint) {
    await this.access.assertCanInteract(userId);
    await this.assertPublicPost(postId);
    const result = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.forumLike.deleteMany({
        where: { user_id: userId, target_type: FORUM_LIKE_TARGET, target_id: postId },
      });
      if (removed.count)
        await tx.forumPost.update({
          where: { id: postId },
          data: { like_count: { decrement: 1 } },
        });
      return this.recomputePostCounts(tx, postId);
    });
    return { liked: false, like_count: result.like_count };
  }

  private async consumePostLimits(userId: bigint, ip: string) {
    const rates = await this.config.rates();
    const subject = `${userId.toString()}:${ip}`;
    await this.rateLimits.consume({
      scope: 'forum.post.minute',
      subject,
      limit: rates.postMinute,
      windowSeconds: 60,
    });
    await this.rateLimits.consume({
      scope: 'forum.post.day',
      subject,
      limit: rates.postDay,
      windowSeconds: 86_400,
    });
  }

  private async consumeReplyLimits(userId: bigint, ip: string) {
    const rates = await this.config.rates();
    const subject = `${userId.toString()}:${ip}`;
    await this.rateLimits.consume({
      scope: 'forum.reply.10s',
      subject,
      limit: rates.replyTenSeconds,
      windowSeconds: 10,
    });
    await this.rateLimits.consume({
      scope: 'forum.reply.day',
      subject,
      limit: rates.replyDay,
      windowSeconds: 86_400,
    });
  }

  private async assertBoardActive(id: bigint) {
    const board = await this.prisma.forumBoard.findFirst({
      where: { id, status: 1, deleted_at: null },
      select: { id: true },
    });
    if (!board)
      throw new AppException(FORUM_ERROR.BOARD_CLOSED, '板块不存在或已关闭', HttpStatus.CONFLICT);
  }

  private async assertPublicPost(id: bigint) {
    const post = await this.prisma.forumPost.findFirst({
      where: {
        id,
        status: 1,
        moderation_status: 1,
        published_at: { not: null },
        deleted_at: null,
        board: { status: 1, deleted_at: null },
      },
      select: { id: true },
    });
    if (!post)
      throw new AppException(FORUM_ERROR.NOT_FOUND, '帖子不存在或已失效', HttpStatus.NOT_FOUND);
  }

  private async validateImages(userId: bigint, ids: bigint[], currentPostId?: bigint) {
    if (!ids.length) return [];
    const files = await this.prisma.fileRecord.findMany({
      where: {
        id: { in: ids },
        user_id: userId,
        file_type: { in: ['image/jpeg', 'image/png', 'image/webp'] },
        file_key: { startsWith: 'forum/' },
      },
      include: { forum_post_image: { select: { post_id: true } } },
    });
    const byId = new Map(files.map((file) => [file.id.toString(), file]));
    const ordered = ids.map((id) => byId.get(id.toString()));
    if (
      ordered.some(
        (file) =>
          !file || (file.forum_post_image && file.forum_post_image.post_id !== currentPostId),
      )
    ) {
      throw new AppException(
        FORUM_ERROR.INVALID_IMAGE,
        '图片不存在、类型不受支持、非本人上传或已被使用',
        HttpStatus.BAD_REQUEST,
      );
    }
    return ordered as NonNullable<(typeof ordered)[number]>[];
  }

  private publicInclude() {
    return {
      board: { select: { id: true, slug: true, name: true, status: true } },
      user: { select: { id: true, nickname: true, avatar_url: true } },
      images: {
        include: { file_record: { select: { id: true, cdn_url: true, file_type: true } } },
        orderBy: { order: 'asc' as const },
      },
    };
  }

  private toPost(post: PublicForumPost, liked: boolean, includeContent: boolean) {
    return {
      id: post.id.toString(),
      title: post.title,
      ...(includeContent
        ? { content: post.content, content_format: post.content_format }
        : { excerpt: post.content.slice(0, 120) }),
      status: post.status,
      moderation_status: post.moderation_status,
      moderation_reason: post.moderation_reason,
      moderation_error: post.moderation_last_error_code ? true : false,
      board: { id: post.board.id.toString(), slug: post.board.slug, name: post.board.name },
      author: {
        id: post.user.id.toString(),
        nickname: post.user.nickname,
        avatar_url: post.user.avatar_url,
      },
      images: post.images.map((image) => ({
        id: image.file_record.id.toString(),
        url: image.file_record.cdn_url,
        order: image.order,
      })),
      liked,
      like_count: post.like_count,
      reply_count: post.reply_count,
      published_at: post.published_at,
      created_at: post.created_at,
      offline_reason: post.offline_reason,
    };
  }

  private toReply(reply: PublicForumReply) {
    return {
      id: reply.id.toString(),
      content: reply.content,
      content_format: reply.content_format,
      status: reply.status,
      moderation_status: reply.moderation_status,
      moderation_reason: reply.moderation_reason,
      moderation_error: Boolean(reply.moderation_last_error_code),
      author: {
        id: reply.user.id.toString(),
        nickname: reply.user.nickname,
        avatar_url: reply.user.avatar_url,
      },
      published_at: reply.published_at,
      created_at: reply.created_at,
      offline_reason: reply.offline_reason,
    };
  }

  private async ownerPostState(id: bigint) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id },
      select: {
        status: true,
        moderation_status: true,
        moderation_reason: true,
        moderation_last_error_code: true,
        manual_review_required: true,
      },
    });
    return post;
  }

  private async ownerReplyState(id: bigint) {
    const reply = await this.prisma.forumReply.findUnique({
      where: { id },
      select: {
        status: true,
        moderation_status: true,
        moderation_reason: true,
        moderation_last_error_code: true,
        manual_review_required: true,
      },
    });
    return reply;
  }

  private async likedIds(userId: bigint | undefined, ids: bigint[]) {
    if (!userId || !ids.length) return new Set<string>();
    const likes = await this.prisma.forumLike.findMany({
      where: { user_id: userId, target_type: FORUM_LIKE_TARGET, target_id: { in: ids } },
      select: { target_id: true },
    });
    return new Set(likes.map((like) => like.target_id.toString()));
  }

  private encodeCursor(
    post: { id: bigint; published_at: Date | null; hot_score: Prisma.Decimal },
    sort: 'latest' | 'hot',
  ) {
    const value: ForumCursor =
      sort === 'hot'
        ? {
            kind: 'hot',
            score: post.hot_score.toString(),
            publishedAt: post.published_at!.toISOString(),
            id: post.id.toString(),
          }
        : { kind: 'latest', publishedAt: post.published_at!.toISOString(), id: post.id.toString() };
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeCursor(value: string, sort: 'latest' | 'hot'): ForumCursor {
    try {
      const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ForumCursor;
      if (
        cursor.kind !== sort ||
        !cursor.id ||
        !cursor.publishedAt ||
        Number.isNaN(new Date(cursor.publishedAt).getTime()) ||
        (cursor.kind === 'hot' && !/^-?\d+(?:\.\d+)?$/.test(cursor.score))
      )
        throw new Error('invalid');
      BigInt(cursor.id);
      return cursor;
    } catch {
      throw new AppException(FORUM_ERROR.INVALID_CURSOR, '分页游标无效', HttpStatus.BAD_REQUEST);
    }
  }

  private postCursorWhere(cursor: ForumCursor): Prisma.ForumPostWhereInput {
    const publishedAt = new Date(cursor.publishedAt);
    const id = BigInt(cursor.id);
    if (cursor.kind === 'latest')
      return {
        OR: [{ published_at: { lt: publishedAt } }, { published_at: publishedAt, id: { lt: id } }],
      };
    const score = new Prisma.Decimal(cursor.score);
    return {
      OR: [
        { hot_score: { lt: score } },
        { hot_score: score, published_at: { lt: publishedAt } },
        { hot_score: score, published_at: publishedAt, id: { lt: id } },
      ],
    };
  }

  private decodeReplyCursor(value: string): { publishedAt: string; id: string } {
    try {
      const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        publishedAt: string;
        id: string;
      };
      if (!cursor.id || Number.isNaN(new Date(cursor.publishedAt).getTime()))
        throw new Error('invalid');
      BigInt(cursor.id);
      return cursor;
    } catch {
      throw new AppException(FORUM_ERROR.INVALID_CURSOR, '分页游标无效', HttpStatus.BAD_REQUEST);
    }
  }

  private async recomputePostCounts(tx: Prisma.TransactionClient, postId: bigint) {
    const post = await tx.forumPost.findUniqueOrThrow({
      where: { id: postId },
      select: { like_count: true, reply_count: true },
    });
    const likeCount = Math.max(0, post.like_count);
    await tx.forumPost.update({
      where: { id: postId },
      data: {
        like_count: likeCount,
        hot_score: Math.min(999_999, likeCount * 2 + Math.max(0, post.reply_count) * 3),
      },
    });
    return { like_count: likeCount };
  }

  private async adjustReplyCount(tx: Prisma.TransactionClient, postId: bigint, delta: 1 | -1) {
    const post = await tx.forumPost.findUniqueOrThrow({
      where: { id: postId },
      select: { reply_count: true, like_count: true },
    });
    const replyCount = Math.max(0, post.reply_count + delta);
    await tx.forumPost.update({
      where: { id: postId },
      data: {
        reply_count: replyCount,
        hot_score: Math.min(999_999, post.like_count * 2 + replyCount * 3),
      },
    });
  }

  private assertLength(value: string, min: number, max: number, label: string) {
    const length = Array.from(value).length;
    if (length < min || length > max)
      throw new AppException(
        FORUM_ERROR.INVALID_CONTENT,
        `${label}长度需为 ${min}-${max} 字`,
        HttpStatus.BAD_REQUEST,
      );
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
