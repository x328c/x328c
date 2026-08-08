import { Global, Module } from '@nestjs/common';
import { StructuredLoggerService } from '../logging/structured-logger.service';
import { ObservabilityModule } from '../observability/observability.module';
import { TaskFailureService } from './task-failure.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [TaskFailureService, StructuredLoggerService],
  exports: [TaskFailureService],
})
export class TaskFailureModule {}
