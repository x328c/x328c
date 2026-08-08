import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../logging/structured-logger.service';

@Injectable()
export class TaskFailureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService,
  ) {}

  async record(
    taskKey: string,
    fingerprint: string,
    errorCode: string,
    summary: string,
    payloadSummary?: Prisma.InputJsonValue,
    nextRetryAt?: Date,
  ) {
    const row = await this.prisma.taskFailure.upsert({
      where: { fingerprint },
      create: {
        task_key: taskKey,
        fingerprint,
        status: 0,
        attempts: 1,
        last_error_code: errorCode,
        last_error_summary: summary.slice(0, 500),
        payload_summary: payloadSummary,
        next_retry_at: nextRetryAt,
      },
      update: {
        status: 0,
        attempts: { increment: 1 },
        last_failed_at: new Date(),
        last_error_code: errorCode,
        last_error_summary: summary.slice(0, 500),
        payload_summary: payloadSummary,
        next_retry_at: nextRetryAt,
        resolved_by: null,
        resolved_at: null,
        resolution_note: null,
      },
      select: { id: true, attempts: true },
    });
    this.metrics.increment(`task.failure.${taskKey}`);
    this.logger.warn({
      event: 'background_task_failed',
      task_key: taskKey,
      failure_id: row.id.toString(),
      attempts: row.attempts,
      error_code: errorCode,
    });
    return { id: row.id, attempts: row.attempts };
  }

  async list(status = 0, page = 1, pageSize = 20) {
    const safePage = Math.min(Math.max(page, 1), 100);
    const safeSize = Math.min(Math.max(pageSize, 1), 50);
    const where = { status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskFailure.findMany({
        where,
        orderBy: [{ last_failed_at: 'desc' }, { id: 'desc' }],
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
      this.prisma.taskFailure.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        id: item.id.toString(),
        resolved_by: item.resolved_by?.toString() ?? null,
      })),
      pagination: { page: safePage, pageSize: safeSize, total },
    };
  }

  async retry(id: bigint) {
    const result = await this.prisma.taskFailure.updateMany({
      where: { id, status: 0 },
      data: { next_retry_at: null },
    });
    if (!result.count)
      throw new AppException(75001, '任务失败记录不存在或已处理', HttpStatus.CONFLICT);
    return { id: id.toString(), status: 0, retry_requested: true };
  }

  async resolve(id: bigint, adminId: bigint, note: string) {
    if (note.trim().length < 2)
      throw new AppException(75002, '补偿说明不能为空', HttpStatus.BAD_REQUEST);
    const result = await this.prisma.taskFailure.updateMany({
      where: { id, status: 0 },
      data: {
        status: 1,
        resolved_by: adminId,
        resolved_at: new Date(),
        resolution_note: note.trim().slice(0, 500),
        next_retry_at: null,
      },
    });
    if (!result.count)
      throw new AppException(75001, '任务失败记录不存在或已处理', HttpStatus.CONFLICT);
    return { id: id.toString(), status: 1, resolved: true };
  }
}
