import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import Redis from 'ioredis';

export type GeoUnit = 'm' | 'km' | 'mi' | 'ft';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly subscriber: Redis;

  constructor(configService: ConfigService) {
    const port = Number(configService.get<string>('REDIS_PORT', '6379'));
    const options = {
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port,
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      db: Number(configService.get<string>('REDIS_DB', '0')),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 10_000,
    };
    this.client = new Redis({ ...options, connectionName: 'jiangxing-command' });
    this.subscriber = new Redis({ ...options, connectionName: 'jiangxing-subscriber' });
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([this.client.connect(), this.subscriber.connect()]);
    await this.client.ping();
    this.logger.log('Redis command/subscriber connections are ready');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client.quit(), this.subscriber.quit()]);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async setWithJitter(
    key: string,
    value: string,
    ttlSeconds: number,
    jitterSeconds = Math.max(1, Math.floor(ttlSeconds * 0.1)),
  ): Promise<number> {
    const jitter = jitterSeconds > 0 ? randomInt(0, jitterSeconds + 1) : 0;
    const effectiveTtl = ttlSeconds + jitter;
    await this.client.set(key, value, 'EX', effectiveTtl);
    return effectiveTtl;
  }
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }
  async del(...keys: string[]): Promise<number> {
    return keys.length ? this.client.del(...keys) : 0;
  }
  async deleteByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) deleted += await this.client.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.expire(key, ttlSeconds)) === 1;
  }
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async withLock<T>(
    key: string,
    ttlSeconds: number,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    const token = randomUUID();
    const acquired = await this.setIfAbsent(key, token, ttlSeconds);
    if (!acquired) return null;
    try {
      return await operation();
    } finally {
      const release = `
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
        return 0
      `;
      await this.client.eval(release, 1, key, token).catch(() => undefined);
    }
  }
  async incrementWithinWindow(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    const script = `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      local ttl = redis.call('TTL', KEYS[1])
      return { count, ttl }
    `;
    const result = (await this.client.eval(script, 1, key, ttlSeconds)) as [number, number];
    return { count: Number(result[0]), ttlSeconds: Number(result[1]) };
  }
  async geoAdd(key: string, longitude: number, latitude: number, member: string): Promise<number> {
    return this.client.geoadd(key, longitude, latitude, member);
  }
  async geoRadius(
    key: string,
    longitude: number,
    latitude: number,
    radius: number,
    unit: GeoUnit = 'km',
  ): Promise<string[]> {
    const members = await this.client.georadius(key, longitude, latitude, radius, unit);
    return members as string[];
  }
  async geoRadiusWithDistance(
    key: string,
    longitude: number,
    latitude: number,
    radius: number,
    unit: GeoUnit = 'km',
  ): Promise<Array<{ member: string; distance: number }>> {
    const rows = (await this.client.call(
      'GEORADIUS',
      key,
      longitude,
      latitude,
      radius,
      unit,
      'WITHDIST',
    )) as Array<[string, string]>;
    return rows.map(([member, distance]) => ({ member, distance: Number(distance) }));
  }
  async geoRemove(key: string, member: string): Promise<number> {
    return this.client.zrem(key, member);
  }
}
