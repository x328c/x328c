import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppException } from '../common/exceptions/app.exception';
import { RequireFeatureFlag } from '../common/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '../common/feature-flag/feature-flag.guard';
import { RegulationFeedbackDto, RegulationListQueryDto, RegulationSearchQueryDto } from './dto';
import { RegulationService } from './regulation.service';

type UserRequest = Request & { user: JwtPayload };
function regulationId(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new AppException(54001, '无效的法规 ID');
  return BigInt(value);
}

@Controller('regulations')
@RequireFeatureFlag('regulation.enabled')
@UseGuards(FeatureFlagGuard)
export class RegulationController {
  constructor(private readonly regulations: RegulationService) {}

  @Get() list(@Query() query: RegulationListQueryDto) {
    return this.regulations.list(query);
  }
  // 静态 search 必须位于 :id 之前，避免被动态参数捕获。
  @Get('search') search(@Query() query: RegulationSearchQueryDto) {
    return this.regulations.search(query);
  }
  @Post(':id/feedback')
  @UseGuards(JwtAuthGuard)
  feedback(
    @Req() request: UserRequest,
    @Param('id') id: string,
    @Body() dto: RegulationFeedbackDto,
  ) {
    return this.regulations.feedback(regulationId(id), BigInt(request.user.sub), dto);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.regulations.detail(regulationId(id));
  }
}
