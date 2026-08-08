import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  FORUM_CONTENT_STATUS,
  FORUM_MAX_MODERATION_ATTEMPTS,
  FORUM_MODERATION_BACKOFF_SECONDS,
  FORUM_MODERATION_STATUS,
  ForumContentType,
} from './forum.constants';
import { ForumModerationGateway, ModerationDecision } from './forum-moderation.gateway';
import { ForumModerationMetricsService } from './forum-moderation-metrics.service';

@Injectable()
export class ForumModerationService {
  private readonly logger = new Logger(ForumModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ForumModerationGateway,
    private readonly metrics: ForumModerationMetricsService,
    private readonly flags: FeatureFlagService,
  ) {}

  async moderatePost(id: bigint): Promise<'pass' | 'reject' | 'error' | 'skipped'> {
    const post = await this.prisma.forumPost.findFirst({
      where: {
        id,
        status: FORUM_CONTENT_STATUS.ACTIVE,
        moderation_status: FORUM_MODERATION_STATUS.PENDING,
        deleted_at: null,
      },
      include: { images: { include: { file_record: true }, orderBy: { order: 'asc' } } },
    });
    if (!post) return 'skipped';
    const attempt = post.moderation_attempts + 1;
    const claimed = await this.prisma.forumPost.updateMany({
      where: {
        id,
        moderation_status: FORUM_MODERATION_STATUS.PENDING,
        moderation_version: post.moderation_version,
        moderation_attempts: post.moderation_attempts,
        deleted_at: null,
      },
      data: { moderation_attempts: attempt },
    });
    if (!claimed.count) return 'skipped';

    const text = await this.gateway.checkText(
      `${post.title}\n${post.content}`,
      `forum-post-${post.id.toString()}-v${post.moderation_version}`,
    );
    const images = await Promise.all(
      post.images.map(async (image) => ({
        image,
        decision: await this.gateway.checkImage(image.file_record.file_url),
      })),
    );
    const decisions = [text, ...images.map((item) => item.decision)];
    const rejected = decisions.find((item) => item.decision === 'reject');
    const failed = decisions.find((item) => item.decision === 'error');
    const result = rejected ? 'reject' : failed ? 'error' : 'pass';
    this.metrics.record(result);

    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        images.map(({ image, decision }) =>
          tx.forumPostImage.updateMany({
            where: { id: image.id, post_id: id },
            data: this.imageDecision(decision, image.moderation_attempts + 1, attempt),
          }),
        ),
      );
      if (result === 'pass') {
        await tx.forumPost.updateMany({
          where: { id, moderation_version: post.moderation_version, deleted_at: null },
          data: {
            moderation_status: FORUM_MODERATION_STATUS.APPROVED,
            moderation_reason: null,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
            manual_review_required: false,
            published_at: new Date(),
          },
        });
      } else if (result === 'reject') {
        await tx.forumPost.updateMany({
          where: { id, moderation_version: post.moderation_version, deleted_at: null },
          data: {
            moderation_status: FORUM_MODERATION_STATUS.REJECTED,
            moderation_reason: (rejected as Extract<ModerationDecision, { decision: 'reject' }>)
              .reason,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
            manual_review_required: false,
            published_at: null,
          },
        });
      } else {
        const code = (failed as Extract<ModerationDecision, { decision: 'error' }>).code;
        await tx.forumPost.updateMany({
          where: { id, moderation_version: post.moderation_version, deleted_at: null },
          data: {
            moderation_status: FORUM_MODERATION_STATUS.PENDING,
            moderation_next_retry_at: this.nextRetry(attempt),
            moderation_last_error_code: code,
            moderation_last_error_at: new Date(),
            manual_review_required: true,
            published_at: null,
          },
        });
        this.logger.warn({
          event: 'forum_moderation_failed',
          contentType: 'post',
          contentId: id.toString(),
          attempt,
          errorCode: code,
        });
      }
    });
    return result;
  }

  async moderateReply(id: bigint): Promise<'pass' | 'reject' | 'error' | 'skipped'> {
    const reply = await this.prisma.forumReply.findFirst({
      where: { id, status: FORUM_CONTENT_STATUS.ACTIVE, moderation_status: 0, deleted_at: null },
    });
    if (!reply) return 'skipped';
    const attempt = reply.moderation_attempts + 1;
    const claimed = await this.prisma.forumReply.updateMany({
      where: {
        id,
        moderation_status: FORUM_MODERATION_STATUS.PENDING,
        moderation_version: reply.moderation_version,
        moderation_attempts: reply.moderation_attempts,
        deleted_at: null,
      },
      data: { moderation_attempts: attempt },
    });
    if (!claimed.count) return 'skipped';
    const decision = await this.gateway.checkText(
      reply.content,
      `forum-reply-${reply.id.toString()}-v${reply.moderation_version}`,
    );
    this.metrics.record(decision.decision);
    await this.prisma.$transaction(async (tx) => {
      if (decision.decision === 'pass') {
        const published = await tx.forumReply.updateMany({
          where: {
            id,
            moderation_version: reply.moderation_version,
            moderation_status: 0,
            deleted_at: null,
          },
          data: {
            moderation_status: FORUM_MODERATION_STATUS.APPROVED,
            moderation_reason: null,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
            manual_review_required: false,
            published_at: new Date(),
          },
        });
        if (published.count) await this.incrementReplyCount(tx, reply.post_id, 1);
      } else if (decision.decision === 'reject') {
        await tx.forumReply.updateMany({
          where: { id, moderation_version: reply.moderation_version, deleted_at: null },
          data: {
            moderation_status: FORUM_MODERATION_STATUS.REJECTED,
            moderation_reason: decision.reason,
            moderation_next_retry_at: null,
            moderation_last_error_code: null,
            moderation_last_error_at: null,
            manual_review_required: false,
            published_at: null,
          },
        });
      } else {
        await tx.forumReply.updateMany({
          where: { id, moderation_version: reply.moderation_version, deleted_at: null },
          data: {
            moderation_next_retry_at: this.nextRetry(attempt),
            moderation_last_error_code: decision.code,
            moderation_last_error_at: new Date(),
            manual_review_required: true,
            published_at: null,
          },
        });
        this.logger.warn({
          event: 'forum_moderation_failed',
          contentType: 'reply',
          contentId: id.toString(),
          attempt,
          errorCode: decision.code,
        });
      }
    });
    return decision.decision;
  }

  async forceRetry(type: ForumContentType, id: bigint): Promise<string> {
    if (type === 'post') {
      await this.prisma.forumPost.updateMany({
        where: { id, moderation_status: 0, deleted_at: null },
        data: {
          moderation_attempts: 0,
          moderation_next_retry_at: new Date(),
          manual_review_required: false,
        },
      });
      return this.moderatePost(id);
    }
    await this.prisma.forumReply.updateMany({
      where: { id, moderation_status: 0, deleted_at: null },
      data: {
        moderation_attempts: 0,
        moderation_next_retry_at: new Date(),
        manual_review_required: false,
      },
    });
    return this.moderateReply(id);
  }

  async retryDue(limit = 20): Promise<{ posts: number; replies: number }> {
    if (
      !(await this.flags.isEnabled('forum.enabled')) ||
      !(await this.flags.isEnabled('forum.write_enabled'))
    ) {
      return { posts: 0, replies: 0 };
    }
    const now = new Date();
    const [posts, replies] = await Promise.all([
      this.prisma.forumPost.findMany({
        where: {
          moderation_status: 0,
          deleted_at: null,
          moderation_attempts: { lt: FORUM_MAX_MODERATION_ATTEMPTS },
          moderation_next_retry_at: { lte: now },
        },
        select: { id: true },
        orderBy: { moderation_next_retry_at: 'asc' },
        take: limit,
      }),
      this.prisma.forumReply.findMany({
        where: {
          moderation_status: 0,
          deleted_at: null,
          moderation_attempts: { lt: FORUM_MAX_MODERATION_ATTEMPTS },
          moderation_next_retry_at: { lte: now },
        },
        select: { id: true },
        orderBy: { moderation_next_retry_at: 'asc' },
        take: limit,
      }),
    ]);
    for (const post of posts) await this.moderatePost(post.id);
    for (const reply of replies) await this.moderateReply(reply.id);
    return { posts: posts.length, replies: replies.length };
  }

  private imageDecision(decision: ModerationDecision, imageAttempt: number, postAttempt: number) {
    const attempts = Math.max(imageAttempt, postAttempt);
    if (decision.decision === 'pass')
      return {
        moderation_status: 1,
        moderation_reason: null,
        moderation_attempts: attempts,
        moderation_next_retry_at: null,
        moderation_last_error_code: null,
        moderation_last_error_at: null,
      };
    if (decision.decision === 'reject')
      return {
        moderation_status: 2,
        moderation_reason: decision.reason,
        moderation_attempts: attempts,
        moderation_next_retry_at: null,
        moderation_last_error_code: null,
        moderation_last_error_at: null,
      };
    return {
      moderation_status: 0,
      moderation_attempts: attempts,
      moderation_next_retry_at: this.nextRetry(postAttempt),
      moderation_last_error_code: decision.code,
      moderation_last_error_at: new Date(),
    };
  }

  private nextRetry(attempt: number): Date | null {
    if (attempt >= FORUM_MAX_MODERATION_ATTEMPTS) return null;
    const seconds = FORUM_MODERATION_BACKOFF_SECONDS[Math.max(0, attempt - 1)];
    return new Date(Date.now() + seconds * 1000);
  }

  private async incrementReplyCount(tx: Prisma.TransactionClient, postId: bigint, delta: 1 | -1) {
    const post = await tx.forumPost.update({
      where: { id: postId },
      data: { reply_count: delta === 1 ? { increment: 1 } : { decrement: 1 } },
      select: { reply_count: true, like_count: true },
    });
    await tx.forumPost.update({
      where: { id: postId },
      data: {
        hot_score: Math.min(999_999, post.like_count * 2 + Math.max(0, post.reply_count) * 3),
      },
    });
  }
}
