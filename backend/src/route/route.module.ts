import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AdminRouteController } from './admin-route.controller';
import { AdminRouteService } from './admin-route.service';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { RouteCacheService } from './route-cache.service';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';
import { RouteCommentService } from './route-comment.service';
import { RouteCommentController } from './route-comment.controller';
import { AdminRouteCommentController } from './admin-route-comment.controller';
import { UserRouteController } from './user-route.controller';
import { UserRouteService } from './user-route.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [
    RouteController,
    AdminRouteController,
    RouteCommentController,
    AdminRouteCommentController,
    UserRouteController,
  ],
  providers: [
    RouteService,
    AdminRouteService,
    RouteCacheService,
    RouteCommentService,
    UserRouteService,
    OptionalJwtAuthGuard,
  ],
  exports: [RouteService, AdminRouteService],
})
export class RouteModule {}
