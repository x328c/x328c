import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    // Preserve the Prisma client's `this` context when registering events;
    // invoking an extracted `$on` method directly fails at runtime.
    const onQuery = this.$on.bind(this) as unknown as (
      event: 'query',
      callback: (event: { duration: number; query: string }) => void,
    ) => void;
    onQuery('query', (event) => {
      if (event.duration < 500) return;
      // Keep slow-query telemetry free of bind values and request bodies.
      this.logger.warn({
        event: 'db.query.slow',
        durationMs: event.duration,
        query: event.query.replace(/\s+/g, ' ').slice(0, 240),
      });
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
