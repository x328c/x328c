import { Test } from '@nestjs/testing';
import { RedisService } from '../src/common/redis/redis.service';
import { IdempotencyService } from '../src/common/resilience/idempotency.service';
import { RateLimitService } from '../src/common/resilience/rate-limit.service';

class InMemoryRedis {
  private readonly values = new Map<string, string>();
  private readonly counters = new Map<string, number>();

  get(key: string) {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string) {
    this.values.set(key, value);
    return Promise.resolve();
  }

  setIfAbsent(key: string, value: string) {
    if (this.values.has(key)) return Promise.resolve(false);
    this.values.set(key, value);
    return Promise.resolve(true);
  }

  del(key: string) {
    return Promise.resolve(this.values.delete(key) ? 1 : 0);
  }

  incrementWithinWindow(key: string, ttlSeconds: number) {
    const count = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, count);
    return Promise.resolve({ count, ttlSeconds });
  }
}

describe('resilience services (integration)', () => {
  let rateLimits: RateLimitService;
  let idempotency: IdempotencyService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RateLimitService,
        IdempotencyService,
        { provide: RedisService, useClass: InMemoryRedis },
      ],
    }).compile();
    rateLimits = module.get(RateLimitService);
    idempotency = module.get(IdempotencyService);
  });

  it('shares a stateful window and rejects the first over-limit request', async () => {
    const input = { scope: 'write', subject: 'user:1', limit: 2, windowSeconds: 60 };

    await expect(rateLimits.consume(input)).resolves.toMatchObject({ remaining: 1 });
    await expect(rateLimits.consume(input)).resolves.toMatchObject({ remaining: 0 });
    await expect(rateLimits.consume(input)).rejects.toMatchObject({ status: 429 });
  });

  it('persists a completion result and replays without executing twice', async () => {
    const operation = jest.fn().mockResolvedValue({ id: 'created-once' });
    const input = {
      scope: 'write',
      actorKey: 'user:1',
      key: 'idempotency-key-1',
      payload: { title: 'same request' },
    };

    await expect(idempotency.execute(input, operation)).resolves.toMatchObject({ replayed: false });
    await expect(idempotency.execute(input, operation)).resolves.toMatchObject({ replayed: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
