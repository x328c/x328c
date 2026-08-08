import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { getRequestId } from '../common/request/request-context';
import { AdminFeatureFlagService } from './admin-feature-flag.service';
import { UpdateFeatureFlagsDto } from './dto';
import { AdminJwtPayload } from './entity/admin-token.entity';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

type AdminRequest = Request & { user: AdminJwtPayload };

@Controller('admin/feature-flags')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminFeatureFlagController {
  constructor(private readonly featureFlags: AdminFeatureFlagService) {}

  @Get()
  getAll() {
    return this.featureFlags.getAll();
  }

  @Patch()
  @Roles(9)
  update(@Req() request: AdminRequest, @Body() dto: UpdateFeatureFlagsDto) {
    return this.featureFlags.update(dto, {
      adminId: BigInt(request.user.sub),
      requestId: getRequestId(request),
      ipAddress: request.ip,
    });
  }
}
