import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StructuredLoggerService } from './logging/structured-logger.service';
import { FeatureFlagModule } from './feature-flag/feature-flag.module';
import { ResilienceModule } from './resilience/resilience.module';
import { OperationLogModule } from './operation-log/operation-log.module';
import { ObservabilityModule } from './observability/observability.module';
import { TaskFailureModule } from './task-failure/task-failure.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    FeatureFlagModule,
    ResilienceModule,
    OperationLogModule,
    ObservabilityModule,
    TaskFailureModule,
  ],
  providers: [StructuredLoggerService],
  exports: [
    PrismaModule,
    RedisModule,
    FeatureFlagModule,
    ResilienceModule,
    OperationLogModule,
    StructuredLoggerService,
    ObservabilityModule,
    TaskFailureModule,
  ],
})
export class CommonModule {}
