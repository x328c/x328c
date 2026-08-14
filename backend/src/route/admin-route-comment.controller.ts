import { Body, Controller, Delete, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { getRequestId } from '../common/request/request-context';
import { EntityIdParamDto } from '../common/dto/entity-id-param.dto';
import { AdminRouteCommentQueryDto, DeleteRouteCommentDto } from './dto';
import { RouteCommentService } from './route-comment.service';

@Controller('admin/route-comments')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Roles(1, 9)
export class AdminRouteCommentController {
  constructor(private readonly comments: RouteCommentService) {}
  @Get() list(@Query() query: AdminRouteCommentQueryDto) {
    return this.comments.adminList(query);
  }
  @Delete(':id')
  remove(
    @Req() req: Request & { user: AdminJwtPayload },
    @Param() params: EntityIdParamDto,
    @Body() dto: DeleteRouteCommentDto,
  ) {
    return this.comments.adminRemove(BigInt(params.id), dto, {
      adminId: BigInt(req.user.sub),
      requestId: getRequestId(req),
      ipAddress: req.ip,
    });
  }
}
