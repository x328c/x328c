import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../redis/redis.service';

interface IdempotencyInput {
  scope: string;
  actorKey: string;
  key: string;
  payload: unknown;
  ttlSeconds?: number;
}

export interface IdempotencyResult<T> {
  value: T;
  replayed: boolean;
}

interface StoredResult<T = unknown> {
  fingerprint: string;
  status: 'pending' | 'completed';
  value?: T;
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(',')}}`;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  async execute<T>(
    input: IdempotencyInput,
    operation: () => Promise<T>,
  ): Promise<IdempotencyResult<T>> {
    if (!input.key || input.key.length > 128) {
      throw new AppException(40002, 'Idempotency-Key 无效', HttpStatus.BAD_REQUEST);
    }
    const ttlSeconds = input.ttlSeconds ?? 600;
    const redisKey = `v2:idempotency:${hash(`${input.scope}:${input.actorKey}:${input.key}`)}`;
    const fingerprint = hash(canonicalize(input.payload));

    let acquired = false;
    try {
      const existing = await this.redis.get(redisKey);
      if (existing) return this.resolveExisting<T>(existing, fingerprint);
      acquired = await this.redis.setIfAbsent(
        redisKey,
        JSON.stringify({ fingerprint, status: 'pending' } satisfies StoredResult),
        ttlSeconds,
      );
      if (!acquired) {
        const raced = await this.redis.get(redisKey);
        if (raced) return this.resolveExisting<T>(raced, fingerprint);
        throw new Error('Idempotency lock disappeared');
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(50303, '幂等保护服务暂不可用', HttpStatus.SERVICE_UNAVAILABLE);
    }

    try {
      const value = await operation();
      try {
        await this.redis.set(
          redisKey,
          JSON.stringify({ fingerprint, status: 'completed', value } satisfies StoredResult<T>),
          ttlSeconds,
        );
      } catch {
        // 保留 pending 锁直到 TTL，避免业务已成功后因缓存写失败被重复执行。
      }
      return { value, replayed: false };
    } catch (error) {
      if (acquired) await this.redis.del(redisKey).catch(() => undefined);
      throw error;
    }
  }

  private resolveExisting<T>(raw: string, fingerprint: string): IdempotencyResult<T> {
    let stored: StoredResult<T>;
    try {
      stored = JSON.parse(raw) as StoredResult<T>;
      if (
        !stored ||
        typeof stored !== 'object' ||
        typeof stored.fingerprint !== 'string' ||
        !['pending', 'completed'].includes(stored.status)
      ) {
        throw new Error('Invalid idempotency record');
      }
    } catch {
      throw new AppException(50303, '幂等保护服务暂不可用', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (stored.fingerprint !== fingerprint) {
      throw new AppException(40901, '幂等键已用于不同请求', HttpStatus.CONFLICT);
    }
    if (stored.status !== 'completed') {
      throw new AppException(40902, '相同请求正在处理中', HttpStatus.CONFLICT);
    }
    return { value: stored.value as T, replayed: true };
  }
}
