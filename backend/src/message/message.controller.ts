import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationIdDto, NotificationQueryDto } from './dto';
import { NotificationService } from './message.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly notification: NotificationService) {}
  @Get() list(@Req() req: Request & { user: JwtPayload }, @Query() query: NotificationQueryDto) {
    return this.notification.list(BigInt(req.user.sub), query);
  }
  @Get('unread-count') unreadCount(@Req() req: Request & { user: JwtPayload }) {
    return this.notification.unreadCount(BigInt(req.user.sub));
  }
  @Post('read-all') readAll(@Req() req: Request & { user: JwtPayload }) {
    return this.notification.readAll(BigInt(req.user.sub));
  }
  @Post(':id/read') read(
    @Req() req: Request & { user: JwtPayload },
    @Param() params: NotificationIdDto,
  ) {
    return this.notification.read(BigInt(req.user.sub), BigInt(params.id));
  }
}
