import {
  Body,
  Controller,
  Delete,
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
import { AppException } from '../common/exceptions/app.exception';
import { RequireFeatureFlag } from '../common/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '../common/feature-flag/feature-flag.guard';
import { CreateRouteCommentDto, RouteCommentListDto, RouteListQueryDto } from './dto';
import { RouteCommentService } from './route-comment.service';
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
  constructor(
    private readonly routes: RouteService,
    private readonly comments: RouteCommentService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Req() request: OptionalUserRequest, @Query() query: RouteListQueryDto) {
    return this.routes.list(query, request.user ? BigInt(request.user.sub) : undefined);
  }

  @Get(':id/related-rides')
  relatedRides(@Param('id') id: string) {
    return this.routes.relatedRides(routeId(id));
  }

  @Get(':id/share')
  share(@Param('id') id: string) {
    return this.routes.share(routeId(id));
  }

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  commentsList(
    @Req() request: OptionalUserRequest,
    @Param('id') id: string,
    @Query() query: RouteCommentListDto,
  ) {
    return this.comments.list(
      routeId(id),
      query,
      request.user ? BigInt(request.user.sub) : undefined,
    );
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  commentsCreate(
    @Req() request: UserRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateRouteCommentDto,
  ) {
    return this.comments.create(
      BigInt(request.user.sub),
      routeId(id),
      dto.content,
      dto.images ?? [],
      idempotencyKey,
    );
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
