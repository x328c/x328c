import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const DEFAULTS = {
  postMinute: 1,
  postDay: 5,
  replyTenSeconds: 1,
  replyDay: 50,
  likeMinute: 60,
  reportMinute: 10,
} as const;

const KEYS = {
  postMinute: 'forum.rate.post.minute',
  postDay: 'forum.rate.post.day',
  replyTenSeconds: 'forum.rate.reply.ten_seconds',
  replyDay: 'forum.rate.reply.day',
  likeMinute: 'forum.rate.like.minute',
  reportMinute: 'forum.rate.report.minute',
} as const;

export type ForumRateConfig = typeof DEFAULTS;

@Injectable()
export class ForumConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async rates(): Promise<ForumRateConfig> {
    try {
      const rows = await this.prisma.systemSetting.findMany({
        where: { key: { in: Object.values(KEYS) }, deleted_at: null },
        select: { key: true, value: true },
      });
      const values = new Map(rows.map((row) => [row.key, row.value]));
      return Object.fromEntries(
        Object.entries(KEYS).map(([name, key]) => [
          name,
          this.safeNumber(values.get(key), DEFAULTS[name as keyof ForumRateConfig]),
        ]),
      ) as unknown as ForumRateConfig;
    } catch {
      return DEFAULTS;
    }
  }

  private safeNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : fallback;
  }
}
