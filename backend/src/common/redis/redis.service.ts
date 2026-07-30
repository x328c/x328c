import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  async del(...keys: string[]): Promise<number> {
    return keys.length ? this.client.del(...keys) : 0;
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
