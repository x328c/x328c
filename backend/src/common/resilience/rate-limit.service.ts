import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../redis/redis.service';

export interface RateLimitInput {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
}

export interface RateLimitDecision {
  allowed: true;
  remaining: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(input: RateLimitInput): Promise<RateLimitDecision> {
    if (input.limit < 1 || input.windowSeconds < 1) {
      throw new Error('Rate limit and window must be positive');
    }
    const subjectHash = createHash('sha256').update(input.subject).digest('hex');
    const key = `v2:rate:${input.scope}:${subjectHash}`;

    try {
      const result = await this.redis.incrementWithinWindow(key, input.windowSeconds);
      if (result.count > input.limit) {
        throw new AppException(42901, '请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
      }
      return {
        allowed: true,
        remaining: Math.max(0, input.limit - result.count),
        retryAfterSeconds: Math.max(1, result.ttlSeconds),
      };
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (input.failClosed ?? true) {
        throw new AppException(50302, '请求保护服务暂不可用', HttpStatus.SERVICE_UNAVAILABLE);
      }
      return { allowed: true, remaining: input.limit, retryAfterSeconds: input.windowSeconds };
    }
  }
}
