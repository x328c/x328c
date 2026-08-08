import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ForumModule } from '../forum/forum.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [AuthModule, ForumModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
