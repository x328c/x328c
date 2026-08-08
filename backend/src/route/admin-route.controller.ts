import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { RequireFeatureFlag } from '../common/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '../common/feature-flag/feature-flag.guard';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { getRequestId } from '../common/request/request-context';
import { AdminRouteService } from './admin-route.service';
import { AdminRouteQueryDto, CreateRouteDto, OfflineRouteDto, UpdateRouteDto } from './dto';

type AdminRequest = Request & { user: AdminJwtPayload };

function routeId(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new AppException(53001, '无效的路线 ID');
  return BigInt(value);
}

function auditContext(request: AdminRequest): OperationActorContext {
  return {
    adminId: BigInt(request.user.sub),
    requestId: getRequestId(request),
    ipAddress: request.ip,
  };
}

@Controller('admin/routes')
@RequireFeatureFlag('route.enabled')
@UseGuards(FeatureFlagGuard, AdminJwtGuard, AdminRolesGuard)
@Roles(1, 9)
export class AdminRouteController {
  constructor(private readonly routes: AdminRouteService) {}

  @Get()
  list(@Query() query: AdminRouteQueryDto) {
    return this.routes.list(query);
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() dto: CreateRouteDto) {
    return this.routes.create(dto, auditContext(request));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.routes.detail(routeId(id));
  }

  @Patch(':id')
  update(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.routes.update(routeId(id), dto, auditContext(request));
  }

  @Post(':id/publish')
  @Roles(9)
  publish(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.routes.publish(routeId(id), auditContext(request));
  }

  @Post(':id/offline')
  offline(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: OfflineRouteDto) {
    return this.routes.offline(routeId(id), dto.reason, auditContext(request));
  }
}
