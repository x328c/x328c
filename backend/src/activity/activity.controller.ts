import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityService } from './activity.service';
import {
  ActivityActionDto,
  ActivityQueryDto,
  ApproveRegistrationDto,
  CreateActivityDto,
  MineActivityDto,
  RegisterActivityDto,
  RemoveRegistrationDto,
  UpdateActivityDto,
} from './dto';

@Controller('activities')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}
  @Get() list(@Query() query: ActivityQueryDto) {
    return this.service.list(query);
  }
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: Request & { user: JwtPayload }, @Query() query: MineActivityDto) {
    return this.service.mine(BigInt(req.user.sub), query);
  }
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  detail(@Req() req: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.service.detail(BigInt(req.user.sub), BigInt(id));
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: Request & { user: JwtPayload }, @Body() dto: CreateActivityDto) {
    return this.service.create(BigInt(req.user.sub), dto);
  }
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.service.update(BigInt(req.user.sub), BigInt(id), dto);
  }
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() req: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.service.cancel(BigInt(req.user.sub), BigInt(id));
  }
  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  register(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: RegisterActivityDto,
  ) {
    return this.service.register(BigInt(req.user.sub), BigInt(id), dto);
  }
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  approve(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: ApproveRegistrationDto,
  ) {
    return this.service.approve(BigInt(req.user.sub), BigInt(id), dto);
  }
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  leave(@Req() req: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.service.leave(BigInt(req.user.sub), BigInt(id));
  }
  @Get(':id/registrations')
  @UseGuards(JwtAuthGuard)
  registrations(@Req() req: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.service.registrations(BigInt(req.user.sub), BigInt(id));
  }
  @Post(':id/remove-registration')
  @UseGuards(JwtAuthGuard)
  removeRegistration(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: RemoveRegistrationDto,
  ) {
    return this.service.removeRegistration(BigInt(req.user.sub), BigInt(id), BigInt(dto.user_id));
  }
  @Post(':id/notify')
  @UseGuards(JwtAuthGuard)
  notify(
    @Req() req: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: ActivityActionDto,
  ) {
    return this.service.notify(BigInt(req.user.sub), BigInt(id), dto);
  }
}
