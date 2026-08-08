import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin/entity/admin-token.entity';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { RequireFeatureFlag } from '../common/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '../common/feature-flag/feature-flag.guard';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { getRequestId } from '../common/request/request-context';
import { AdminRegulationService } from './admin-regulation.service';
import { RegulationImportService, UploadedCsv } from './regulation-import.service';
import {
  AdminQueueQueryDto,
  AdminRegulationQueryDto,
  BatchRegulationWorkflowDto,
  ExpireRegulationDto,
  RegulationDraftDto,
  UpdateRegulationDraftDto,
  WorkflowReasonDto,
} from './dto';
import { REGULATION_LIMITS } from './regulation.constants';

type AdminRequest = Request & { user: AdminJwtPayload };
function regulationId(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new AppException(54001, '无效的法规 ID');
  return BigInt(value);
}
function actor(request: AdminRequest): OperationActorContext {
  return {
    adminId: BigInt(request.user.sub),
    requestId: getRequestId(request),
    ipAddress: request.ip,
  };
}

@Controller('admin/regulations')
@RequireFeatureFlag('regulation.enabled')
@UseGuards(FeatureFlagGuard, AdminJwtGuard, AdminRolesGuard)
@Roles(1, 9)
export class AdminRegulationController {
  constructor(
    private readonly regulations: AdminRegulationService,
    private readonly imports: RegulationImportService,
  ) {}

  @Get()
  @Roles(1, 2, 9)
  list(@Query() query: AdminRegulationQueryDto) {
    return this.regulations.list(query);
  }
  @Post() create(@Req() request: AdminRequest, @Body() dto: RegulationDraftDto) {
    return this.regulations.create(dto, actor(request));
  }

  @Get('feedbacks') feedbacks(@Query() query: AdminQueueQueryDto) {
    return this.regulations.feedbacks(query);
  }
  @Post('feedbacks/:id/resolve') resolveFeedback(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: WorkflowReasonDto,
  ) {
    return this.regulations.resolveFeedback(regulationId(id), dto.reason, actor(request));
  }

  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: REGULATION_LIMITS.csvBytes, files: 1 } }),
  )
  previewImport(
    @Req() request: AdminRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @UploadedFile() file?: UploadedCsv,
  ) {
    return this.imports.preview(file, idempotencyKey, actor(request));
  }

  @Get('imports/:id') importDetail(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.imports.detail(regulationId(id), BigInt(request.user.sub), request.user.role);
  }
  @Get('imports') importTasks(@Req() request: AdminRequest, @Query() query: AdminQueueQueryDto) {
    return this.imports.list(BigInt(request.user.sub), request.user.role, query);
  }
  @Post('imports/:id/confirm') confirmImport(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: WorkflowReasonDto,
  ) {
    return this.imports.confirm(regulationId(id), dto.reason, actor(request));
  }

  @Post('batch/submit-review')
  @Roles(1, 9)
  batchSubmitReview(@Req() request: AdminRequest, @Body() dto: BatchRegulationWorkflowDto) {
    return this.regulations.batchSubmitReview(
      dto.ids.map(regulationId),
      dto.reason,
      actor(request),
    );
  }

  @Post('batch/review')
  @Roles(2, 9)
  batchReview(@Req() request: AdminRequest, @Body() dto: BatchRegulationWorkflowDto) {
    return this.regulations.batchReview(dto.ids.map(regulationId), dto.reason, actor(request));
  }

  @Post('batch/publish')
  @Roles(9)
  batchPublish(@Req() request: AdminRequest, @Body() dto: BatchRegulationWorkflowDto) {
    return this.regulations.batchPublish(dto.ids.map(regulationId), dto.reason, actor(request));
  }

  @Get(':id')
  @Roles(1, 2, 9)
  detail(@Param('id') id: string) {
    return this.regulations.detail(regulationId(id));
  }
  @Patch(':id') update(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRegulationDraftDto,
  ) {
    return this.regulations.update(regulationId(id), dto, actor(request));
  }
  @Post(':id/submit-review') submitReview(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: WorkflowReasonDto,
  ) {
    return this.regulations.submitReview(regulationId(id), dto.reason, actor(request));
  }
  @Post(':id/review')
  @Roles(2, 9)
  review(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: WorkflowReasonDto) {
    return this.regulations.review(regulationId(id), dto.reason, actor(request));
  }
  @Post(':id/publish')
  @Roles(9)
  publish(@Req() request: AdminRequest, @Param('id') id: string, @Body() dto: WorkflowReasonDto) {
    return this.regulations.publish(regulationId(id), dto.reason, actor(request));
  }
  @Post(':id/expire') expire(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ExpireRegulationDto,
  ) {
    return this.regulations.expire(regulationId(id), dto, actor(request));
  }
  @Post(':id/replace') replace(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ExpireRegulationDto,
  ) {
    return this.regulations.replace(regulationId(id), dto, actor(request));
  }
  @Post(':id/offline') offline(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: WorkflowReasonDto,
  ) {
    return this.regulations.offline(regulationId(id), dto.reason, actor(request));
  }
}
