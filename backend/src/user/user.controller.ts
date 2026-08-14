import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { UserService } from './user.service';
import { Equals, IsBoolean } from 'class-validator';

class CloseAccountDto {
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@Req() request: Request & { user: JwtPayload }) {
    return this.userService.getCurrentProfile(BigInt(request.user.sub));
  }

  @Put('profile')
  updateProfile(@Req() request: Request & { user: JwtPayload }, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(BigInt(request.user.sub), dto);
  }

  @Post('update-location')
  updateLocation(@Req() request: Request & { user: JwtPayload }, @Body() dto: UpdateLocationDto) {
    return this.userService.updateLocation(BigInt(request.user.sub), dto);
  }

  @Delete('account')
  closeAccount(@Req() request: Request & { user: JwtPayload }, @Body() dto: CloseAccountDto) {
    return this.userService.closeAccount(BigInt(request.user.sub), dto.confirmed);
  }

  @Get(':id')
  getPublicProfile(
    @Req() request: Request & { user: JwtPayload },
    @Param() params: UserIdParamDto,
  ) {
    return this.userService.getPublicProfile(BigInt(request.user.sub), BigInt(params.id));
  }
}
