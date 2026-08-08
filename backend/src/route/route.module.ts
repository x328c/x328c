import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AdminRouteController } from './admin-route.controller';
import { AdminRouteService } from './admin-route.service';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { RouteCacheService } from './route-cache.service';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [RouteController, AdminRouteController],
  providers: [RouteService, AdminRouteService, RouteCacheService, OptionalJwtAuthGuard],
  exports: [RouteService, AdminRouteService],
})
export class RouteModule {}
