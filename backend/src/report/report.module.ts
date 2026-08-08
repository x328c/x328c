import { Module } from '@nestjs/common';
import { AdminReportController } from './admin-report.controller';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { OperationLogModule } from '../common/operation-log/operation-log.module';
@Module({
  imports: [OperationLogModule],
  controllers: [ReportController, AdminReportController],
  providers: [ReportService],
})
export class ReportModule {}
