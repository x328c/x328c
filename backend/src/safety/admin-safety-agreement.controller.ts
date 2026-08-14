import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { getRequestId } from '../common/request/request-context';
import { EntityIdParamDto } from '../common/dto/entity-id-param.dto';
import { AgreementReasonDto, CreateSafetyAgreementDto } from './dto/agreement.dto';
import { SafetyAgreementService } from './safety-agreement.service';

type AdminRequest = Request & { user: AdminJwtPayload };
@Controller('admin/safety-agreements')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Roles(1, 2, 9)
export class AdminSafetyAgreementController {
  constructor(private readonly agreements: SafetyAgreementService) {}
  @Get() list() {
    return this.agreements.adminList();
  }
  @Post()
  @Roles(1, 9)
  create(@Req() req: AdminRequest, @Body() dto: CreateSafetyAgreementDto) {
    return this.agreements.create(dto, this.actor(req));
  }
  @Post(':id/review')
  @Roles(2, 9)
  review(
    @Req() req: AdminRequest,
    @Param() params: EntityIdParamDto,
    @Body() dto: AgreementReasonDto,
  ) {
    return this.agreements.review(BigInt(params.id), this.actor(req), dto.reason);
  }
  @Post(':id/publish')
  @Roles(9)
  publish(
    @Req() req: AdminRequest,
    @Param() params: EntityIdParamDto,
    @Body() dto: AgreementReasonDto,
  ) {
    return this.agreements.publish(BigInt(params.id), this.actor(req), dto.reason);
  }
  private actor(req: AdminRequest) {
    return { adminId: BigInt(req.user.sub), requestId: getRequestId(req), ipAddress: req.ip };
  }
}
