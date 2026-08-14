import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { getRequestId } from '../common/request/request-context';
import { EntityIdParamDto } from '../common/dto/entity-id-param.dto';
import { CreateSafetyGuideRevisionDto, GuideReasonDto } from './dto/guide.dto';
import { SafetyGuideService } from './safety-guide.service';

type AdminRequest = Request & { user: AdminJwtPayload };
@Controller('admin/safety-guides')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Roles(1, 2, 9)
export class AdminSafetyGuideController {
  constructor(private readonly guides: SafetyGuideService) {}
  @Get() list() {
    return this.guides.adminList();
  }
  @Post('revisions')
  @Roles(1, 9)
  create(@Req() req: AdminRequest, @Body() dto: CreateSafetyGuideRevisionDto) {
    return this.guides.createRevision(dto, this.actor(req));
  }
  @Post('revisions/:id/review')
  @Roles(2, 9)
  review(@Req() req: AdminRequest, @Param() params: EntityIdParamDto, @Body() dto: GuideReasonDto) {
    return this.guides.review(BigInt(params.id), this.actor(req), dto.reason);
  }
  @Post('revisions/:id/publish')
  @Roles(9)
  publish(
    @Req() req: AdminRequest,
    @Param() params: EntityIdParamDto,
    @Body() dto: GuideReasonDto,
  ) {
    return this.guides.publish(BigInt(params.id), this.actor(req), dto.reason);
  }
  @Post(':id/offline')
  @Roles(9)
  offline(
    @Req() req: AdminRequest,
    @Param() params: EntityIdParamDto,
    @Body() dto: GuideReasonDto,
  ) {
    return this.guides.offline(BigInt(params.id), this.actor(req), dto.reason);
  }
  private actor(req: AdminRequest) {
    return { adminId: BigInt(req.user.sub), requestId: getRequestId(req), ipAddress: req.ip };
  }
}
