import { Module } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../route/guards/optional-jwt-auth.guard';
import { FeedbackController } from './feedback.controller';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, FeedbackController],
  providers: [SettingsService, OptionalJwtAuthGuard],
})
export class SettingsModule {}
