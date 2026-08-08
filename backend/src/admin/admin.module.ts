import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { OperationLogModule } from '../common/operation-log/operation-log.module';
import { AdminFeatureFlagController } from './admin-feature-flag.controller';
import { AdminFeatureFlagService } from './admin-feature-flag.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), OperationLogModule],
  controllers: [AdminController, AdminFeatureFlagController],
  providers: [
    AdminService,
    AdminFeatureFlagService,
    AdminJwtStrategy,
    AdminJwtGuard,
    AdminRolesGuard,
  ],
  exports: [AdminJwtGuard, AdminRolesGuard],
})
export class AdminModule {}
