import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FeatureFlagService } from './feature-flag.service';

describe('FeatureFlagService', () => {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    setWithJitter: jest.fn(),
    del: jest.fn(),
  } as unknown as RedisService;
  const prisma = {
    featureFlag: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
  } as unknown as PrismaService;
  const featureFlag = (
    prisma as never as {
      featureFlag: { findFirst: jest.Mock; upsert: jest.Mock };
    }
  ).featureFlag;
  const service = new FeatureFlagService(prisma, redis);

  beforeEach(() => jest.clearAllMocks());

  it('uses safe defaults when no persisted flag exists', async () => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    featureFlag.findFirst.mockResolvedValue(null);
    (redis.setWithJitter as jest.Mock).mockResolvedValue(30);

    await expect(service.isEnabled('route.enabled')).resolves.toBe(false);
    await expect(service.isEnabled('regulation.enabled')).resolves.toBe(false);
    await expect(service.isEnabled('forum.enabled')).resolves.toBe(false);
    await expect(service.isEnabled('forum.write_enabled')).resolves.toBe(false);
    await expect(service.get('forum.publish_mode')).resolves.toBe('invite_only');
  });

  it('fails closed for forum when the cache is unavailable', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('redis unavailable'));

    await expect(service.isEnabled('forum.enabled')).resolves.toBe(false);
    expect(featureFlag.findFirst).not.toHaveBeenCalled();
  });

  it('rejects controlled functionality with a stable compatible error', async () => {
    (redis.get as jest.Mock).mockResolvedValue('false');

    await expect(service.assertEnabled('regulation.enabled')).rejects.toMatchObject({
      status: 503,
    });
    try {
      await service.assertEnabled('regulation.enabled');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getResponse()).toEqual({
        code: 52001,
        message: '功能暂未开放',
      });
    }
  });

  it('uses a valid cached value without querying the database', async () => {
    (redis.get as jest.Mock).mockResolvedValue('true');

    await expect(service.isEnabled('route.enabled')).resolves.toBe(true);
    expect(featureFlag.findFirst).not.toHaveBeenCalled();
  });

  it('loads persisted values on a cache miss and safely handles invalid values', async () => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    featureFlag.findFirst.mockResolvedValue({ value: 'gray' });
    (redis.setWithJitter as jest.Mock).mockResolvedValue(30);

    await expect(service.get('forum.publish_mode')).resolves.toBe('gray');
    expect(redis.setWithJitter).toHaveBeenCalledWith(
      'v2:feature-flag:forum.publish_mode',
      'gray',
      30,
    );

    (redis.get as jest.Mock).mockResolvedValue('not-a-boolean');
    await expect(service.isEnabled('forum.enabled')).resolves.toBe(false);
    (redis.get as jest.Mock).mockResolvedValue('not-a-mode');
    await expect(service.get('forum.publish_mode')).resolves.toBe('invite_only');
  });

  it('updates persistent state and invalidates its cache key', async () => {
    featureFlag.upsert.mockResolvedValue({});
    (redis.del as jest.Mock).mockResolvedValue(1);

    await expect(service.set('forum.enabled', true, 9n)).resolves.toBeUndefined();
    expect(featureFlag.upsert).toHaveBeenCalledWith({
      where: { key: 'forum.enabled' },
      create: { key: 'forum.enabled', value: 'true', updated_by: 9n },
      update: { value: 'true', updated_by: 9n, deleted_at: null },
    });
    expect(redis.del).toHaveBeenCalledWith('v2:feature-flag:forum.enabled');
  });
});
