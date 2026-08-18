import { Controller, Headers, Ip, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { OptionalTelemetryJwtGuard } from './optional-jwt.guard';
import { TrackTelemetryEventDto } from './dto/telemetry.dto';
import { TelemetryService } from './telemetry.service';

type OptionalUserRequest = Request & { user?: JwtPayload };

@Controller('telemetry')
@UseGuards(OptionalTelemetryJwtGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('events')
  track(
    @Body() dto: TrackTelemetryEventDto,
    @Req() request: OptionalUserRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const subject = `${ip}:${userAgent?.slice(0, 32) ?? 'unknown'}`;
    return this.telemetry.track(dto, request.user ? BigInt(request.user.sub) : undefined, subject);
  }
}
