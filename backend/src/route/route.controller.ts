import { Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppException } from '../common/exceptions/app.exception';
import { RequireFeatureFlag } from '../common/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '../common/feature-flag/feature-flag.guard';
import { RouteListQueryDto } from './dto';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { RouteService } from './route.service';

type OptionalUserRequest = Request & { user?: JwtPayload };
type UserRequest = Request & { user: JwtPayload };

function routeId(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new AppException(53001, '无效的路线 ID');
  return BigInt(value);
}

@Controller('routes')
@RequireFeatureFlag('route.enabled')
@UseGuards(FeatureFlagGuard)
export class RouteController {
  constructor(private readonly routes: RouteService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Req() request: OptionalUserRequest, @Query() query: RouteListQueryDto) {
    return this.routes.list(query, request.user ? BigInt(request.user.sub) : undefined);
  }

  @Get(':id/related-rides')
  relatedRides(@Param('id') id: string) {
    return this.routes.relatedRides(routeId(id));
  }

  @Put(':id/favorite')
  @UseGuards(JwtAuthGuard)
  favorite(@Req() request: UserRequest, @Param('id') id: string) {
    return this.routes.favorite(BigInt(request.user.sub), routeId(id));
  }

  @Delete(':id/favorite')
  @UseGuards(JwtAuthGuard)
  unfavorite(@Req() request: UserRequest, @Param('id') id: string) {
    return this.routes.unfavorite(BigInt(request.user.sub), routeId(id));
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  detail(@Req() request: OptionalUserRequest, @Param('id') id: string) {
    return this.routes.detail(routeId(id), request.user ? BigInt(request.user.sub) : undefined);
  }
}
