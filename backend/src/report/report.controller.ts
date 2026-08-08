import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReportDto } from './dto';
import { ReportService } from './report.service';
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}
  @Post() create(@Req() req: Request & { user: JwtPayload }, @Body() dto: CreateReportDto) {
    return this.reports.create(BigInt(req.user.sub), req.ip ?? '', dto);
  }
}
