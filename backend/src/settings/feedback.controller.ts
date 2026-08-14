import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { OptionalJwtAuthGuard } from '../route/guards/optional-jwt-auth.guard';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { SettingsService } from './settings.service';

@Controller('feedback')
@UseGuards(OptionalJwtAuthGuard)
export class FeedbackController {
  constructor(private readonly settings: SettingsService) {}
  @Post()
  create(
    @Req() req: Request & { user?: JwtPayload },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateFeedbackDto,
  ) {
    const userId = req.user ? BigInt(req.user.sub) : undefined;
    return this.settings.feedback(
      userId,
      userId?.toString() ?? req.ip ?? 'anonymous',
      idempotencyKey,
      dto,
    );
  }
}
