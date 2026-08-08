import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../redis/redis.service';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const redis = { incrementWithinWindow: jest.fn() } as unknown as RedisService;
  const service = new RateLimitService(redis);
  const input = { scope: 'forum.create', subject: 'user:42', limit: 2, windowSeconds: 60 };

  beforeEach(() => jest.clearAllMocks());

  it('returns remaining capacity without exposing the raw subject in Redis keys', async () => {
    (redis.incrementWithinWindow as jest.Mock).mockResolvedValue({ count: 1, ttlSeconds: 55 });

    await expect(service.consume(input)).resolves.toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 55,
    });
    const key = (redis.incrementWithinWindow as jest.Mock).mock.calls[0][0] as string;
    expect(key).not.toContain('user:42');
  });

  it('rejects over-limit requests and fails closed when Redis is unavailable', async () => {
    (redis.incrementWithinWindow as jest.Mock).mockResolvedValue({ count: 3, ttlSeconds: 20 });
    await expect(service.consume(input)).rejects.toBeInstanceOf(AppException);

    (redis.incrementWithinWindow as jest.Mock).mockRejectedValue(new Error('redis unavailable'));
    await expect(service.consume(input)).rejects.toMatchObject({ status: 503 });
  });
});
