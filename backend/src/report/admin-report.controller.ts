import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminReportQueryDto, HandleReportDto } from './dto';
import { ReportService } from './report.service';
import { getRequestId } from '../common/request/request-context';
@Controller('admin/reports')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Roles(1, 9)
export class AdminReportController {
  constructor(private readonly reports: ReportService) {}
  @Get() list(@Query() query: AdminReportQueryDto) {
    return this.reports.list(query);
  }
  @Post(':id/handle') handle(
    @Req() req: Request & { user: AdminJwtPayload },
    @Param('id') id: string,
    @Body() dto: HandleReportDto,
  ) {
    return this.reports.handle(
      {
        adminId: BigInt(req.user.sub),
        requestId: getRequestId(req),
        ipAddress: req.ip,
      },
      BigInt(id),
      dto,
    );
  }
}
