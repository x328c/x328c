import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../common/redis/redis.service';

const ROUTE_CACHE_TTL_SECONDS = 60;

@Injectable()
export class RouteCacheService {
  constructor(private readonly redis: RedisService) {}

  async getList<T>(input: Record<string, unknown>): Promise<T | null> {
    return this.getJson<T>(this.listKey(input));
  }

  async setList(input: Record<string, unknown>, value: unknown): Promise<void> {
    await this.setJson(this.listKey(input), value);
  }

  async getDetail<T>(routeId: bigint): Promise<T | null> {
    return this.getJson<T>(`v2:routes:detail:${routeId.toString()}`);
  }

  async setDetail(routeId: bigint, value: unknown): Promise<void> {
    await this.setJson(`v2:routes:detail:${routeId.toString()}`, value);
  }

  async invalidate(routeId: bigint): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(`v2:routes:detail:${routeId.toString()}`),
        this.redis.deleteByPattern('v2:routes:list:*'),
      ]);
    } catch {
      // 读取路径会用数据库状态和 updated_at 校验缓存，失效命令异常也不会泄露下架内容。
    }
  }

  private listKey(input: Record<string, unknown>): string {
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return `v2:routes:list:${digest}`;
  }

  private async getJson<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private async setJson(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.setWithJitter(key, JSON.stringify(value), ROUTE_CACHE_TTL_SECONDS);
    } catch {
      // 路线内容缓存仅用于加速，写入失败时继续使用数据库结果。
    }
  }
}
