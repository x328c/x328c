import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { getRequestId } from '../common/request/request-context';
import { AppException } from '../common/exceptions/app.exception';
import {
  AdminForumQueueQueryDto,
  AdminForumReportQueryDto,
  CreateUserRestrictionDto,
  ForumAuditQueryDto,
  ForumReasonDto,
  SetForumBoardStatusDto,
} from './dto';
import { AdminForumService } from './admin-forum.service';
import { FORUM_ERROR, ForumContentType } from './forum.constants';

type AdminRequest = Request & { user: AdminJwtPayload };
function audit(request: AdminRequest): OperationActorContext {
  return {
    adminId: BigInt(request.user.sub),
    requestId: getRequestId(request),
    ipAddress: request.ip,
  };
}
function contentType(value: string): ForumContentType {
  if (value !== 'post' && value !== 'reply') {
    throw new AppException(FORUM_ERROR.INVALID_CONTENT, '论坛内容类型无效', HttpStatus.BAD_REQUEST);
  }
  return value;
}

@Controller('admin/forum')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Roles(1, 9)
export class AdminForumController {
  constructor(private readonly forum: AdminForumService) {}

  @Get('moderation') queue(@Query() query: AdminForumQueueQueryDto) {
    return this.forum.moderationQueue(query);
  }
  @Get('reports') reports(@Query() query: AdminForumReportQueryDto) {
    return this.forum.reportQueue(query);
  }
  @Get('boards') boards() {
    return this.forum.boards();
  }
  @Get('restrictions') restrictions() {
    return this.forum.restrictions();
  }
  @Get('audit') auditLogs(@Query() query: ForumAuditQueryDto) {
    return this.forum.auditLogs(query);
  }
  @Get('content/:type/:id') preview(@Param('type') type: string, @Param('id') id: string) {
    return this.forum.preview(contentType(type), BigInt(id));
  }

  @Post('moderation/:type/:id/approve')
  approve(
    @Req() request: AdminRequest,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: ForumReasonDto,
  ) {
    return this.forum.approve(audit(request), contentType(type), BigInt(id), dto.reason);
  }
  @Post('moderation/:type/:id/reject')
  reject(
    @Req() request: AdminRequest,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: ForumReasonDto,
  ) {
    return this.forum.reject(audit(request), contentType(type), BigInt(id), dto.reason);
  }
  @Post('moderation/:type/:id/retry')
  retry(
    @Req() request: AdminRequest,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: ForumReasonDto,
  ) {
    return this.forum.retry(audit(request), contentType(type), BigInt(id), dto.reason);
  }
  @Post('content/:type/:id/offline')
  offline(
    @Req() request: AdminRequest,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: ForumReasonDto,
  ) {
    return this.forum.offline(audit(request), contentType(type), BigInt(id), dto.reason);
  }

  @Post('users/:id/restrictions')
  restrict(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: CreateUserRestrictionDto,
  ) {
    return this.forum.restrictUser(audit(request), BigInt(id), dto);
  }
  @Delete('users/:id/restrictions/:restrictionId')
  unrestrict(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Param('restrictionId') restrictionId: string,
    @Body() dto: ForumReasonDto,
  ) {
    return this.forum.unrestrictUser(audit(request), BigInt(id), BigInt(restrictionId), dto.reason);
  }
  @Post('boards/:id/status')
  setBoardStatus(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: SetForumBoardStatusDto,
  ) {
    return this.forum.setBoardStatus(audit(request), BigInt(id), dto.status, dto.reason);
  }
}
