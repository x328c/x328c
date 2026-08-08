import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AdminForumController } from './admin-forum.controller';
import { AdminForumService } from './admin-forum.service';
import { ForumAccessService } from './forum-access.service';
import { ForumConfigService } from './forum-config.service';
import { ForumContentSanitizer } from './forum-content-sanitizer';
import { ForumController } from './forum.controller';
import { ForumModerationGateway } from './forum-moderation.gateway';
import { ForumModerationMetricsService } from './forum-moderation-metrics.service';
import { ForumModerationScheduler } from './forum-moderation.scheduler';
import { ForumModerationService } from './forum-moderation.service';
import { ForumService } from './forum.service';
import { OptionalForumJwtGuard } from './guards/optional-forum-jwt.guard';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [ForumController, AdminForumController],
  providers: [
    ForumService,
    AdminForumService,
    ForumAccessService,
    ForumConfigService,
    ForumContentSanitizer,
    ForumModerationGateway,
    ForumModerationMetricsService,
    ForumModerationService,
    ForumModerationScheduler,
    OptionalForumJwtGuard,
  ],
  exports: [
    ForumService,
    AdminForumService,
    ForumModerationService,
    ForumAccessService,
    OptionalForumJwtGuard,
  ],
})
export class ForumModule {}
