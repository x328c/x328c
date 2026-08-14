import { Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRouteCommentDto, RouteCommentListDto } from './dto';
import { EntityIdParamDto } from '../common/dto/entity-id-param.dto';
import { RouteCommentService } from './route-comment.service';

@Controller('route-comments')
@UseGuards(JwtAuthGuard)
export class RouteCommentController {
  constructor(private readonly comments: RouteCommentService) {}
  @Get('mine') mine(
    @Req() req: Request & { user: JwtPayload },
    @Query() query: RouteCommentListDto,
  ) {
    return this.comments.mine(BigInt(req.user.sub), query);
  }
  @Put(':id') update(
    @Req() req: Request & { user: JwtPayload },
    @Param() params: EntityIdParamDto,
    @Body() dto: CreateRouteCommentDto,
  ) {
    return this.comments.update(BigInt(req.user.sub), BigInt(params.id), dto.content, dto.images);
  }
  @Delete(':id') remove(
    @Req() req: Request & { user: JwtPayload },
    @Param() params: EntityIdParamDto,
  ) {
    return this.comments.remove(BigInt(req.user.sub), BigInt(params.id));
  }
}
