import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { TaskFailureService } from '../common/task-failure/task-failure.service';

@Injectable()
export class RideStatusScheduler {
  private readonly logger = new Logger(RideStatusScheduler.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly failures: TaskFailureService,
  ) {}

  @Cron('0 */15 * * * *')
  async transitionStatuses(): Promise<void> {
    await this.redis.withLock('v2:lock:ride-status', 600, () => this.transitionStatusesLocked());
  }

  private async transitionStatusesLocked(): Promise<void> {
    const now = new Date();
    const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    let count = 0;
    try {
      const upcoming = await this.prisma.ride.findMany({
        where: { status: 1, deleted_at: null, departure_time: { lte: soon } },
      });
      for (const ride of upcoming) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const result = await tx.ride.updateMany({
            where: { id: ride.id, status: 1 },
            data: { status: 2 },
          });
          if (!result.count) return false;
          const recipients = await tx.rideParticipant.findMany({
            where: { ride_id: ride.id, status: 1 },
            select: { user_id: true },
          });
          if (recipients.length)
            await tx.notification.createMany({
              data: recipients.map((item) => ({
                user_id: item.user_id,
                type: 3,
                title: '约骑即将出发',
                content: `“${ride.title}”将在2小时内出发`,
                related_type: 'ride',
                related_id: ride.id,
                from_user_id: ride.user_id,
              })),
            });
          return true;
        });
        if (changed) count += 1;
      }
      const started = await this.prisma.ride.updateMany({
        where: { status: 2, deleted_at: null, departure_time: { lte: now } },
        data: { status: 3 },
      });
      const ended = await this.prisma.ride.findMany({
        where: {
          status: 3,
          deleted_at: null,
          departure_time: { lte: new Date(now.getTime() - 8 * 60 * 60 * 1000) },
        },
      });
      for (const ride of ended) {
        const result = await this.prisma.ride.updateMany({
          where: { id: ride.id, status: 3 },
          data: { status: 4 },
        });
        if (result.count) {
          await this.redis.geoRemove(`geo:rides:${ride.city_code}`, ride.id.toString());
          count += 1;
        }
      }
      if (count || started.count)
        this.logger.log(`Ride statuses updated: ${count + started.count}`);
    } catch (error) {
      await this.failures.record(
        'ride.status',
        `ride-status:${new Date().toISOString().slice(0, 13)}`,
        'ride_status_scheduler_failed',
        error instanceof Error ? error.message : 'ride status scheduler failed',
      );
      throw error;
    }
  }
}
