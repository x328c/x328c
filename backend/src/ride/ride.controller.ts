import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  CreateRideDto,
  MyRideQueryDto,
  NearbyRideDto,
  ParticipantQueryDto,
  RemoveParticipantDto,
  RideQueryDto,
  UpdateRideDto,
  TransferCreatorDto,
} from './dto';
import { RideService } from './ride.service';
import { getRequestId } from '../common/request/request-context';
import { OptionalAgreementDto } from '../safety/dto/agreement.dto';
import { EntityIdParamDto } from '../common/dto/entity-id-param.dto';

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
  participants(@Param() params: EntityIdParamDto, @Query() query: ParticipantQueryDto) {
    return this.rideService.participants(BigInt(params.id), query);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateRideDto,
  ) {
    return this.rideService.create(
      BigInt(request.user.sub),
      dto,
      getRequestId(request),
      idempotencyKey,
    );
  }
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() request: Request & { user: JwtPayload },
    @Param() params: EntityIdParamDto,
    @Body() dto: UpdateRideDto,
  ) {
    return this.rideService.update(BigInt(request.user.sub), BigInt(params.id), dto);
  }
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() request: Request & { user: JwtPayload }, @Param() params: EntityIdParamDto) {
    return this.rideService.cancel(BigInt(request.user.sub), BigInt(params.id));
  }
  @Post(':id/transfer-creator')
  @UseGuards(JwtAuthGuard)
  transferCreator(
    @Req() request: Request & { user: JwtPayload },
    @Param() params: EntityIdParamDto,
    @Body() dto: TransferCreatorDto,
  ) {
    return this.rideService.transferCreator(
      BigInt(request.user.sub),
      BigInt(params.id),
      BigInt(dto.target_user_id),
    );
  }
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  join(
    @Req() request: Request & { user: JwtPayload },
    @Param() params: EntityIdParamDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: OptionalAgreementDto,
  ) {
    return this.rideService.join(
      BigInt(request.user.sub),
      BigInt(params.id),
      dto,
      getRequestId(request),
      idempotencyKey,
    );
  }
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  leave(@Req() request: Request & { user: JwtPayload }, @Param() params: EntityIdParamDto) {
    return this.rideService.leave(BigInt(request.user.sub), BigInt(params.id));
  }
  @Post(':id/remove-participant')
  @UseGuards(JwtAuthGuard)
  removeParticipant(
    @Req() request: Request & { user: JwtPayload },
    @Param() params: EntityIdParamDto,
    @Body() dto: RemoveParticipantDto,
  ) {
    return this.rideService.removeParticipant(
      BigInt(request.user.sub),
      BigInt(params.id),
      BigInt(dto.user_id),
    );
  }
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  detail(@Req() request: Request & { user?: JwtPayload }, @Param() params: EntityIdParamDto) {
    return this.rideService.detail(
      BigInt(params.id),
      request.user ? BigInt(request.user.sub) : undefined,
    );
  }
}
