import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AdminController],
  providers: [AdminService, AdminJwtStrategy, AdminJwtGuard, AdminRolesGuard],
})
export class AdminModule {}
