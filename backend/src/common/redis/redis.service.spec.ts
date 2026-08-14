import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService resilience helpers', () => {
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  } as unknown as ConfigService;
  type TestService = {
    client: { set?: jest.Mock; eval?: jest.Mock };
    setIfAbsent: jest.Mock;
    setWithJitter: RedisService['setWithJitter'];
    withLock: RedisService['withLock'];
  };

  it('registers error listeners so connection failures are handled by the service', () => {
    const service = new RedisService(config) as unknown as {
      client: { listenerCount: (event: string) => number };
      subscriber: { listenerCount: (event: string) => number };
    };
    expect(service.client.listenerCount('error')).toBeGreaterThan(0);
    expect(service.subscriber.listenerCount('error')).toBeGreaterThan(0);
  });

  it('adds bounded TTL jitter to cache writes', async () => {
    const service = new RedisService(config) as unknown as TestService;
    service.client = { set: jest.fn().mockResolvedValue('OK') };
    const ttl = await service.setWithJitter('v2:key', '{}', 100, 5);
    expect(ttl).toBeGreaterThanOrEqual(100);
    expect(ttl).toBeLessThanOrEqual(105);
    expect(service.client.set).toHaveBeenCalledWith('v2:key', '{}', 'EX', ttl);
  });

  it('runs one operation while holding a lock and releases its token', async () => {
    const service = new RedisService(config) as unknown as TestService;
    service.setIfAbsent = jest.fn().mockResolvedValue(true);
    service.client = { eval: jest.fn().mockResolvedValue(1) };
    const operation = jest.fn().mockResolvedValue('done');
    await expect(service.withLock('v2:lock:test', 30, operation)).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(service.client.eval).toHaveBeenCalledTimes(1);
  });

  it('skips the operation when another worker owns the lock', async () => {
    const service = new RedisService(config) as unknown as TestService;
    service.setIfAbsent = jest.fn().mockResolvedValue(false);
    const operation = jest.fn();
    await expect(service.withLock('v2:lock:test', 30, operation)).resolves.toBeNull();
    expect(operation).not.toHaveBeenCalled();
  });
});
