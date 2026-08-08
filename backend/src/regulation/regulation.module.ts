import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AdminRegulationController } from './admin-regulation.controller';
import { AdminRegulationService } from './admin-regulation.service';
import { RegulationController } from './regulation.controller';
import { RegulationImportService } from './regulation-import.service';
import { RegulationService } from './regulation.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [RegulationController, AdminRegulationController],
  providers: [RegulationService, AdminRegulationService, RegulationImportService],
  exports: [RegulationService, AdminRegulationService, RegulationImportService],
})
export class RegulationModule {}
