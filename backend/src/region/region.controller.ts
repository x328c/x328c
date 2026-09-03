import { Controller, Get, Query } from '@nestjs/common';
import { RegionService } from './region.service';

@Controller('regions')
export class RegionController {
  constructor(private readonly regions: RegionService) {}

  @Get()
  list(@Query('province_code') provinceCode?: string) {
    return this.regions.list(provinceCode);
  }
}
