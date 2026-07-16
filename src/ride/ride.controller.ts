import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateRideDto,
  MyRideQueryDto,
  NearbyRideDto,
  ParticipantQueryDto,
  RemoveParticipantDto,
  RideQueryDto,
  UpdateRideDto,
} from './dto';
import { RideService } from './ride.service';

@Controller('rides')
export class RideController {
  constructor(private readonly rideService: RideService) {}
  @Get() list(@Query() query: RideQueryDto) {
    return this.rideService.list(query);
  }
  @Get('nearby') nearby(@Query() query: NearbyRideDto) {
    return this.rideService.nearby(query);
  }
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() request: Request & { user: JwtPayload }, @Query() query: MyRideQueryDto) {
    return this.rideService.mine(BigInt(request.user.sub), query);
  }
  @Get(':id/participants')
  @UseGuards(JwtAuthGuard)
  participants(@Param('id') id: string, @Query() query: ParticipantQueryDto) {
    return this.rideService.participants(BigInt(id), query);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() request: Request & { user: JwtPayload }, @Body() dto: CreateRideDto) {
    return this.rideService.create(BigInt(request.user.sub), dto);
  }
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() request: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateRideDto,
  ) {
    return this.rideService.update(BigInt(request.user.sub), BigInt(id), dto);
  }
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() request: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.rideService.cancel(BigInt(request.user.sub), BigInt(id));
  }
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  join(@Req() request: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.rideService.join(BigInt(request.user.sub), BigInt(id));
  }
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  leave(@Req() request: Request & { user: JwtPayload }, @Param('id') id: string) {
    return this.rideService.leave(BigInt(request.user.sub), BigInt(id));
  }
  @Post(':id/remove-participant')
  @UseGuards(JwtAuthGuard)
  removeParticipant(
    @Req() request: Request & { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: RemoveParticipantDto,
  ) {
    return this.rideService.removeParticipant(
      BigInt(request.user.sub),
      BigInt(id),
      BigInt(dto.user_id),
    );
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.rideService.detail(BigInt(id));
  }
}
