import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { FORUM_ERROR, FORUM_RESTRICTION_TYPE } from './forum.constants';

@Injectable()
export class ForumAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
  ) {}

  async capability(userId?: bigint) {
    const writeEnabled = await this.flags.isEnabled('forum.write_enabled');
    const publishMode = await this.flags.get('forum.publish_mode');
    if (!userId) return { can_write: false, reason: 'login_required', publish_mode: publishMode };
    const user = await this.activeUser(userId, false);
    if (!user) return { can_write: false, reason: 'user_disabled', publish_mode: publishMode };
    const restriction = await this.activeRestriction(userId);
    if (restriction) {
      return {
        can_write: false,
        reason: 'muted',
        publish_mode: publishMode,
        restriction: {
          ends_at: restriction.ends_at,
          reason: restriction.reason,
        },
      };
    }
    if (!writeEnabled) return { can_write: false, reason: 'read_only', publish_mode: publishMode };
    if (!this.allowedByMode(userId, user.forum_invited, publishMode)) {
      return { can_write: false, reason: 'not_invited', publish_mode: publishMode };
    }
    return { can_write: true, reason: null, publish_mode: publishMode };
  }

  async assertCanPublish(userId: bigint) {
    if (!(await this.flags.isEnabled('forum.enabled'))) {
      throw new AppException(52001, '功能暂未开放', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const user = await this.activeUser(userId, true);
    if (!(await this.flags.isEnabled('forum.write_enabled'))) {
      throw new AppException(
        FORUM_ERROR.READ_ONLY,
        '论坛当前为只读模式',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const mode = await this.flags.get('forum.publish_mode');
    if (!this.allowedByMode(userId, user!.forum_invited, mode)) {
      throw new AppException(
        FORUM_ERROR.NOT_INVITED,
        '论坛当前仅对受邀用户开放发布',
        HttpStatus.FORBIDDEN,
      );
    }
    const restriction = await this.activeRestriction(userId);
    if (restriction) {
      throw new AppException(
        FORUM_ERROR.MUTED,
        `你已被禁言至 ${restriction.ends_at.toISOString()}：${restriction.reason}`,
        423 as HttpStatus,
      );
    }
    return user!;
  }

  async assertCanInteract(userId: bigint) {
    const user = await this.activeUser(userId, true);
    if (!(await this.flags.isEnabled('forum.write_enabled'))) {
      throw new AppException(
        FORUM_ERROR.READ_ONLY,
        '论坛当前为只读模式',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return user!;
  }

  async assertActiveUser(userId: bigint) {
    return (await this.activeUser(userId, true))!;
  }

  async activeRestriction(userId: bigint) {
    const now = new Date();
    return this.prisma.userRestriction.findFirst({
      where: {
        user_id: userId,
        type: FORUM_RESTRICTION_TYPE,
        starts_at: { lte: now },
        ends_at: { gt: now },
        deleted_at: null,
      },
      orderBy: { ends_at: 'desc' },
    });
  }

  private async activeUser(userId: bigint, throwWhenMissing: boolean) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 1, deleted_at: null },
      select: { id: true, forum_invited: true },
    });
    if (!user && throwWhenMissing) {
      throw new AppException(FORUM_ERROR.FORBIDDEN, '用户不存在或已被禁用', HttpStatus.FORBIDDEN);
    }
    return user;
  }

  private allowedByMode(userId: bigint, invited: boolean, mode: 'invite_only' | 'gray' | 'all') {
    if (mode === 'all') return true;
    if (invited) return true;
    if (mode === 'invite_only') return false;
    const bucket = createHash('sha256').update(userId.toString()).digest().readUInt16BE(0) % 100;
    return bucket < 10;
  }
}
