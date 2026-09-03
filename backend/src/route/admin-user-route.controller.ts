import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { getRequestId } from '../common/request/request-context';
import { AdminUserRouteService } from './admin-user-route.service';
import { AdminUserRouteQueryDto, OfflineRouteDto } from './dto';

type AdminRequest = Request & { user: AdminJwtPayload };

function userRouteId(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new AppException(53110, '无效的用户路线 ID');
  return BigInt(value);
}

function auditContext(request: AdminRequest): OperationActorContext {
  return {
    adminId: BigInt(request.user.sub),
    requestId: getRequestId(request),
    ipAddress: request.ip,
  };
}

@Controller('admin/user-routes')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Roles(1, 9)
export class AdminUserRouteController {
  constructor(private readonly routes: AdminUserRouteService) {}

  @Get()
  list(@Query() query: AdminUserRouteQueryDto) {
    return this.routes.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.routes.detail(userRouteId(id));
  }

  @Post(':id/offline')
  offline(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: OfflineRouteDto) {
    return this.routes.offline(userRouteId(id), dto.reason, auditContext(request));
  }

  @Post(':id/restore')
  @Roles(9)
  restore(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: OfflineRouteDto) {
    return this.routes.restore(userRouteId(id), dto.reason, auditContext(request));
  }
}
