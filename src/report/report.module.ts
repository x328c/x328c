import { Module } from '@nestjs/common';
import { AdminReportController } from './admin-report.controller';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
@Module({ controllers: [ReportController, AdminReportController], providers: [ReportService] })
export class ReportModule {}
