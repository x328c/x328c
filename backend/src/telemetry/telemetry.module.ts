import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OptionalTelemetryJwtGuard } from './optional-jwt.guard';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [AuthModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, OptionalTelemetryJwtGuard],
  exports: [TelemetryService],
})
export class TelemetryModule {}
