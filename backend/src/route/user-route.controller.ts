import {
  Body,
  Controller,
  Delete,
  Get,
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
import { EntityIdParamDto } from '../common/dto/entity-id-param.dto';
import { CreateRouteCommentDto, RouteCommentListDto } from './dto';
import {
  CreateUserRouteDto,
  UpdateUserRouteDto,
  UserRouteMineQueryDto,
  UserRoutePublicQueryDto,
} from './dto/user-route.dto';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { RouteCommentService } from './route-comment.service';
import { UserRouteService } from './user-route.service';

type UserRequest = Request & { user: JwtPayload };
type OptionalUserRequest = Request & { user?: JwtPayload };

@Controller('user-routes')
export class UserRouteController {
  constructor(
    private readonly routes: UserRouteService,
    private readonly comments: RouteCommentService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: UserRequest, @Body() dto: CreateUserRouteDto) {
    return this.routes.create(BigInt(req.user.sub), dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: UserRequest, @Query() query: UserRouteMineQueryDto) {
    return this.routes.mine(BigInt(req.user.sub), query);
  }

  @Get('public')
  @UseGuards(OptionalJwtAuthGuard)
  publicList(@Req() req: OptionalUserRequest, @Query() query: UserRoutePublicQueryDto) {
    return this.routes.publicList(query, req.user ? BigInt(req.user.sub) : undefined);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  detail(@Req() req: OptionalUserRequest, @Param() params: EntityIdParamDto) {
    return this.routes.detail(BigInt(params.id), req.user ? BigInt(req.user.sub) : undefined);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: UserRequest,
    @Param() params: EntityIdParamDto,
    @Body() dto: UpdateUserRouteDto,
  ) {
    return this.routes.update(BigInt(req.user.sub), BigInt(params.id), dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: UserRequest, @Param() params: EntityIdParamDto) {
    return this.routes.remove(BigInt(req.user.sub), BigInt(params.id));
  }

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  favorite(@Req() req: UserRequest, @Param() params: EntityIdParamDto) {
    return this.routes.favorite(BigInt(req.user.sub), BigInt(params.id));
  }

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  commentList(
    @Req() req: OptionalUserRequest,
    @Param() params: EntityIdParamDto,
    @Query() query: RouteCommentListDto,
  ) {
    return this.comments.listUserRoute(
      BigInt(params.id),
      query,
      req.user ? BigInt(req.user.sub) : undefined,
    );
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  commentCreate(
    @Req() req: UserRequest,
    @Param() params: EntityIdParamDto,
    @Body() dto: CreateRouteCommentDto,
  ) {
    return this.comments.createForUserRoute(
      BigInt(req.user.sub),
      BigInt(params.id),
      dto.content,
      dto.images ?? [],
      req.header('idempotency-key'),
    );
  }
}
