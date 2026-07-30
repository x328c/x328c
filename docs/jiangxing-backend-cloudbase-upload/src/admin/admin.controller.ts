import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  AdminContentQueryDto,
  AdminLoginDto,
  AdminUserQueryDto,
  BanUserDto,
  StatsTrendDto,
} from './dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Post('auth/login') login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.admin.login(dto, req.ip);
  }
  @Get('rides')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  rides(@Query() query: AdminContentQueryDto) {
    return this.admin.rides(query);
  }
  @Post('rides/:id/offline')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  offlineRide(@Param('id') id: string) {
    return this.admin.offlineRide(BigInt(id));
  }
  @Delete('rides/:id')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  deleteRide(@Param('id') id: string) {
    return this.admin.deleteRide(BigInt(id));
  }
  @Get('activities')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  activities(@Query() query: AdminContentQueryDto) {
    return this.admin.activities(query);
  }
  @Post('activities/:id/offline')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  offlineActivity(@Param('id') id: string) {
    return this.admin.offlineActivity(BigInt(id));
  }
  @Delete('activities/:id')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  deleteActivity(@Param('id') id: string) {
    return this.admin.deleteActivity(BigInt(id));
  }
  @Get('users')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  users(@Query() query: AdminUserQueryDto) {
    return this.admin.users(query);
  }
  @Get('users/:id')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(BigInt(id));
  }
  @Post('users/:id/ban')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  ban(@Param('id') id: string, @Body() dto: BanUserDto) {
    return this.admin.banUser(BigInt(id), dto.reason);
  }
  @Post('users/:id/unban')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  unban(@Param('id') id: string) {
    return this.admin.unbanUser(BigInt(id));
  }
  @Get('stats/overview')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  overview() {
    return this.admin.overview();
  }
  @Get('stats/trend')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  trend(@Query() query: StatsTrendDto) {
    return this.admin.trend(query.days ?? 7);
  }
}
