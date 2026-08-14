import { Module } from '@nestjs/common';
import { SafetyAgreementController } from './safety-agreement.controller';
import { SafetyAgreementService } from './safety-agreement.service';
import { SafetyGuideController } from './safety-guide.controller';
import { AdminSafetyGuideController } from './admin-safety-guide.controller';
import { SafetyGuideService } from './safety-guide.service';
import { AdminModule } from '../admin/admin.module';
import { AdminSafetyAgreementController } from './admin-safety-agreement.controller';

@Module({
  imports: [AdminModule],
  controllers: [
    SafetyAgreementController,
    SafetyGuideController,
    AdminSafetyGuideController,
    AdminSafetyAgreementController,
  ],
  providers: [SafetyAgreementService, SafetyGuideService],
  exports: [SafetyAgreementService],
})
export class SafetyModule {}
