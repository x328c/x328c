import { Controller, Get } from '@nestjs/common';
import { SafetyGuideService } from './safety-guide.service';

@Controller('safety-guides')
export class SafetyGuideController {
  constructor(private readonly guides: SafetyGuideService) {}
  @Get('accident-handling') accidentHandling() {
    return this.guides.current('accident_handling');
  }
}
