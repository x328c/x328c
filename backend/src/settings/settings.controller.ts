import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateUserSettingsDto } from './dto/settings.dto';

@Controller('users/me/settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get() get(@Req() req: Request & { user: JwtPayload }) {
    return this.settings.get(BigInt(req.user.sub));
  }
  @Put() update(@Req() req: Request & { user: JwtPayload }, @Body() dto: UpdateUserSettingsDto) {
    return this.settings.update(BigInt(req.user.sub), dto);
  }
}
