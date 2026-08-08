import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { sanitizeLogMetadata, sanitizeLogValue } from '../logging/log-sanitizer';
import { PrismaService } from '../prisma/prisma.service';
import { AppendOperationLogInput } from './operation-log.types';

type OperationLogClient = Pick<Prisma.TransactionClient, 'operationLog'>;

@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  append(input: AppendOperationLogInput) {
    return this.appendWithClient(this.prisma, input);
  }

  async appendWithClient(client: OperationLogClient, input: AppendOperationLogInput) {
    if (
      !input.action ||
      !input.objectType ||
      !input.objectId ||
      !input.reason ||
      !input.requestId
    ) {
      throw new Error('Operation log fields are incomplete');
    }
    const record = await client.operationLog.create({
      data: {
        admin_id: input.adminId,
        action: input.action.slice(0, 100),
        object_type: input.objectType.slice(0, 50),
        object_id: input.objectId.slice(0, 64),
        reason: String(sanitizeLogValue(input.reason)).slice(0, 500),
        ip_address: input.ipAddress?.slice(0, 45),
        request_id: input.requestId.slice(0, 64),
        before_summary: this.summary(input.beforeSummary),
        after_summary: this.summary(input.afterSummary),
      },
      select: { id: true, created_at: true },
    });
    return { id: record.id.toString(), createdAt: record.created_at };
  }

  private summary(value?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    return value
      ? (JSON.parse(JSON.stringify(sanitizeLogMetadata(value))) as Prisma.InputJsonValue)
      : undefined;
  }
}
