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
    await expect(service.isEnabled('route.link_enabled')).resolves.toBe(false);
  });

  it('fails closed for a controlled feature when the cache is unavailable', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('redis unavailable'));

    await expect(service.isEnabled('route.enabled')).resolves.toBe(false);
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
    featureFlag.findFirst.mockResolvedValue({ value: 'true' });
    (redis.setWithJitter as jest.Mock).mockResolvedValue(30);

    await expect(service.get('route.enabled')).resolves.toBe(true);
    expect(redis.setWithJitter).toHaveBeenCalledWith(
      'v2:feature-flag:route.enabled',
      'true',
      30,
    );

    (redis.get as jest.Mock).mockResolvedValue('not-a-boolean');
    await expect(service.isEnabled('route.enabled')).resolves.toBe(false);
  });

  it('updates persistent state and invalidates its cache key', async () => {
    featureFlag.upsert.mockResolvedValue({});
    (redis.del as jest.Mock).mockResolvedValue(1);

    await expect(service.set('route.enabled', true, 9n)).resolves.toBeUndefined();
    expect(featureFlag.upsert).toHaveBeenCalledWith({
      where: { key: 'route.enabled' },
      create: { key: 'route.enabled', value: 'true', updated_by: 9n },
      update: { value: 'true', updated_by: 9n, deleted_at: null },
    });
    expect(redis.del).toHaveBeenCalledWith('v2:feature-flag:route.enabled');
  });
});
