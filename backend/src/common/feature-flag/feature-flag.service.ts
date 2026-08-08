import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  BooleanFeatureFlagKey,
  FEATURE_FLAG_CACHE_TTL_SECONDS,
  FEATURE_FLAG_DEFAULTS,
  FeatureFlagKey,
  FeatureFlagValues,
} from './feature-flag.constants';

@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get<K extends FeatureFlagKey>(key: K): Promise<FeatureFlagValues[K]> {
    const cacheKey = this.cacheKey(key);
    let cached: string | null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch {
      return FEATURE_FLAG_DEFAULTS[key];
    }

    if (cached !== null) return this.parse(key, cached);

    try {
      const flag = await this.prisma.featureFlag.findFirst({
        where: { key, deleted_at: null },
        select: { value: true },
      });
      const value = flag ? this.parse(key, flag.value) : FEATURE_FLAG_DEFAULTS[key];
      await this.redis.setWithJitter(cacheKey, String(value), FEATURE_FLAG_CACHE_TTL_SECONDS);
      return value;
    } catch {
      return FEATURE_FLAG_DEFAULTS[key];
    }
  }

  async isEnabled(key: BooleanFeatureFlagKey): Promise<boolean> {
    return this.get(key);
  }

  async assertEnabled(key: BooleanFeatureFlagKey): Promise<void> {
    if (!(await this.isEnabled(key))) {
      throw new AppException(52001, '功能暂未开放', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async set<K extends FeatureFlagKey>(
    key: K,
    value: FeatureFlagValues[K],
    updatedBy?: bigint,
  ): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, value: String(value), updated_by: updatedBy },
      update: { value: String(value), updated_by: updatedBy, deleted_at: null },
    });
    await this.redis.del(this.cacheKey(key));
  }

  async invalidate(keys: readonly FeatureFlagKey[]): Promise<void> {
    await Promise.all(keys.map((key) => this.redis.del(this.cacheKey(key))));
  }

  private parse<K extends FeatureFlagKey>(key: K, value: string): FeatureFlagValues[K] {
    if (key === 'forum.publish_mode') {
      return (
        ['invite_only', 'gray', 'all'].includes(value) ? value : FEATURE_FLAG_DEFAULTS[key]
      ) as FeatureFlagValues[K];
    }
    if (value === 'true') return true as FeatureFlagValues[K];
    if (value === 'false') return false as FeatureFlagValues[K];
    return FEATURE_FLAG_DEFAULTS[key];
  }

  private cacheKey(key: FeatureFlagKey): string {
    return `v2:feature-flag:${key}`;
  }
}
