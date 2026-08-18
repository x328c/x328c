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
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  AdminContentQueryDto,
  AdminLoginDto,
  AdminUserQueryDto,
  BanUserDto,
  StatsTrendDto,
  TaskFailureNoteDto,
  TaskFailureQueryDto,
} from './dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminJwtPayload } from './entity/admin-token.entity';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { getRequestId } from '../common/request/request-context';
import { MetricsService } from '../common/observability/metrics.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { AppException } from '../common/exceptions/app.exception';
import { TaskFailureService } from '../common/task-failure/task-failure.service';
import { CounterReconciliationService } from '../maintenance/counter-reconciliation.service';

type AdminRequest = Request & { user: AdminJwtPayload };

function auditContext(request: AdminRequest): OperationActorContext {
  return {
    adminId: BigInt(request.user.sub),
    requestId: getRequestId(request),
    ipAddress: request.ip,
  };
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly metrics: MetricsService,
    private readonly taskFailures: TaskFailureService,
    private readonly operationLogs: OperationLogService,
    private readonly counters: CounterReconciliationService,
  ) {}
  @Post('auth/login') login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.admin.login(dto, req.ip);
  }
  @Get('rides')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  rides(@Query() query: AdminContentQueryDto) {
    return this.admin.rides(query);
  }
  @Post('rides/:id/offline')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  offlineRide(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.admin.offlineRide(BigInt(id), auditContext(request));
  }
  @Delete('rides/:id')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  deleteRide(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.admin.deleteRide(BigInt(id), auditContext(request));
  }
  @Get('users')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  users(@Query() query: AdminUserQueryDto) {
    return this.admin.users(query);
  }
  @Get('users/:id')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(BigInt(id));
  }
  @Post('users/:id/ban')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  ban(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: BanUserDto) {
    return this.admin.banUser(BigInt(id), dto.reason, auditContext(request));
  }
  @Post('users/:id/unban')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  unban(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.admin.unbanUser(BigInt(id), auditContext(request));
  }
  @Get('stats/overview')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  overview() {
    return this.admin.overview();
  }
  @Get('stats/trend')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  trend(@Query() query: StatsTrendDto) {
    return this.admin.trend(query.days ?? 7);
  }

  @Get('observability/metrics')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('maintenance/task-failures')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(1, 9)
  taskFailuresList(@Query() query: TaskFailureQueryDto) {
    return this.taskFailures.list(query.status, query.page, query.pageSize);
  }

  @Post('maintenance/task-failures/:id/retry')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  async retryTask(@Req() request: AdminRequest, @Param('id') id: string) {
    const result = await this.taskFailures.retry(this.parsePositiveId(id));
    await this.operationLogs.append({
      ...auditContext(request),
      action: 'maintenance.task_failure.retry',
      objectType: 'task_failure',
      objectId: id,
      reason: '管理员请求重试失败任务',
      afterSummary: result,
    });
    return result;
  }

  @Post('maintenance/task-failures/:id/resolve')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  async resolveTask(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: TaskFailureNoteDto,
  ) {
    const result = await this.taskFailures.resolve(
      this.parsePositiveId(id),
      BigInt(request.user.sub),
      dto.note,
    );
    await this.operationLogs.append({
      ...auditContext(request),
      action: 'maintenance.task_failure.resolve',
      objectType: 'task_failure',
      objectId: id,
      reason: dto.note,
      afterSummary: result,
    });
    return result;
  }

  @Post('maintenance/counters/reconcile')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles(9)
  async reconcileCounters(@Req() request: AdminRequest, @Body() dto: TaskFailureNoteDto) {
    const result = await this.counters.reconcile();
    await this.operationLogs.append({
      ...auditContext(request),
      action: 'maintenance.counters.reconcile',
      objectType: 'counter_reconciliation',
      objectId: 'global',
      reason: dto.note,
      afterSummary: result,
    });
    return result;
  }

  private parsePositiveId(value: string): bigint {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new AppException(40001, 'ID 无效', HttpStatus.BAD_REQUEST);
    }
    return BigInt(value);
  }
}
