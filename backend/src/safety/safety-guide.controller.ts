import { Controller, Get } from '@nestjs/common';
import { SafetyGuideService } from './safety-guide.service';

@Controller('safety-guides')
export class SafetyGuideController {
  constructor(private readonly guides: SafetyGuideService) {}
  @Get('accident-handling') accidentHandling() {
    return this.guides.current('accident_handling');
  }
  @Get('safe-riding-initiative') safeRidingInitiative() {
    return this.guides.current('safe_riding_initiative', {
      notFoundCode: 56008,
      notFoundMessage: '安全骑行倡议暂无已发布版本',
    });
  }
}
