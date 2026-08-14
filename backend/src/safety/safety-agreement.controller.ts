import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveAgreementQueryDto } from './dto/agreement.dto';
import { SafetyAgreementService } from './safety-agreement.service';

@Controller('safety-agreements')
@UseGuards(JwtAuthGuard)
export class SafetyAgreementController {
  constructor(private readonly agreements: SafetyAgreementService) {}

  @Get('active')
  active(@Query() query: ActiveAgreementQueryDto) {
    return this.agreements.active(query.scene);
  }
}
