import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { RateLimitService } from './rate-limit.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [IdempotencyService, RateLimitService],
  exports: [IdempotencyService, RateLimitService],
})
export class ResilienceModule {}
