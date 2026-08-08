import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RedisService } from '../common/redis/redis.service';
import { TaskFailureService } from '../common/task-failure/task-failure.service';
import { ForumModerationService } from './forum-moderation.service';

@Injectable()
export class ForumModerationScheduler {
  private running = false;
  constructor(
    private readonly moderation: ForumModerationService,
    private readonly redis: RedisService,
    private readonly failures: TaskFailureService,
  ) {}

  @Interval(30_000)
  async retryPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.redis.withLock('v2:lock:forum-moderation', 25, async () => {
        try {
          await this.moderation.retryDue();
        } catch (error) {
          await this.failures.record(
            'forum.moderation',
            `forum-moderation:${new Date().toISOString().slice(0, 16)}`,
            'forum_moderation_scheduler_failed',
            error instanceof Error ? error.message : 'moderation scheduler failed',
          );
          throw error;
        }
      });
    } finally {
      this.running = false;
    }
  }
}
