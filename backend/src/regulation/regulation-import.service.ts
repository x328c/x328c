import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateLimitService } from '../common/resilience/rate-limit.service';
import {
  AUTHORITY_LEVELS,
  IMPORT_STATUS,
  REGULATION_CATEGORIES,
  REGULATION_LIMITS,
  REGULATION_SCOPES,
  REGULATION_STATUS,
  REVISION_STATUS,
} from './regulation.constants';
import {
  normalizeDocumentNo,
  normalizeRegulationText,
  normalizedDocumentKey,
} from './regulation-normalizer';
import { AdminQueueQueryDto } from './dto';

export interface UploadedCsv {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface CsvDraft {
  title: string;
  document_no: string | null;
  document_no_empty_reason: string | null;
  issuer: string;
  authority_level: string;
  category: string;
  scope: string;
  regions: Array<{ region_code: string; region_name: string }>;
  tags: string[];
  source_url: string;
  published_at: string | null;
  effective_at: string | null;
  expired_at: string | null;
  effective_note: string | null;
  last_verified_at: string | null;
  review_cycle_days: number;
  replacement_regulation_id: string | null;
  summary: string;
  content: string;
  change_note: string;
}

const HEADERS = [
  'title',
  'document_no',
  'document_no_empty_reason',
  'issuer',
  'authority_level',
  'category',
  'scope',
  'regions',
  'tags',
  'source_url',
  'published_at',
  'effective_at',
  'expired_at',
  'effective_note',
  'last_verified_at',
  'review_cycle_days',
  'replacement_regulation_id',
  'summary',
  'content',
  'change_note',
] as const;

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted) throw new AppException(54201, 'CSV 引号未闭合');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim()));
}

@Injectable()
export class RegulationImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogs: OperationLogService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async preview(
    file: UploadedCsv | undefined,
    idempotencyKey: string | undefined,
    actor: OperationActorContext,
  ) {
    if (!file) throw new AppException(54201, '请选择 CSV 文件');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new AppException(40002, 'Idempotency-Key 无效');
    if (file.size > REGULATION_LIMITS.csvBytes)
      throw new AppException(54202, 'CSV 文件不能超过 2MB', HttpStatus.PAYLOAD_TOO_LARGE);
    if (!file.originalname.toLowerCase().endsWith('.csv'))
      throw new AppException(54201, '仅支持 CSV 文件');
    if (
      ![
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'text/plain',
        'application/octet-stream',
      ].includes(file.mimetype)
    )
      throw new AppException(54201, 'CSV 文件类型无效');
    await this.rateLimit.consume({
      scope: 'regulation-import',
      subject: actor.adminId.toString(),
      limit: 10,
      windowSeconds: 3600,
      failClosed: true,
    });
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const durableKey = createHash('sha256')
      .update(`${actor.adminId}:${idempotencyKey}`)
      .digest('hex');
    const existingByKey = await this.prisma.regulationImportTask.findUnique({
      where: { idempotency_key: durableKey },
    });
    if (existingByKey) {
      if (existingByKey.file_hash !== fileHash)
        throw new AppException(40901, '幂等键已用于不同文件', HttpStatus.CONFLICT);
      return this.detail(existingByKey.id, actor.adminId, 1, true);
    }
    const duplicateFile = await this.prisma.regulationImportTask.findFirst({
      where: { admin_id: actor.adminId, file_hash: fileHash },
      orderBy: { created_at: 'desc' },
    });
    if (duplicateFile) return this.detail(duplicateFile.id, actor.adminId, 1, true);

    const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows = parseCsv(text);
    if (rows.length < 2) throw new AppException(54201, 'CSV 文件没有可导入的数据行');
    if (rows.length - 1 > REGULATION_LIMITS.csvRows)
      throw new AppException(
        54202,
        `CSV 最多 ${REGULATION_LIMITS.csvRows} 行`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    const headers = rows[0].map((item) => item.trim());
    const missingHeaders = HEADERS.filter((header) => !headers.includes(header));
    if (missingHeaders.length)
      throw new AppException(54201, `CSV 缺少字段：${missingHeaders.join('、')}`);
    const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
    const seen = new Set<string>();
    const parsed = await Promise.all(
      rows.slice(1).map(async (values, offset) => {
        const raw = Object.fromEntries(
          HEADERS.map((header) => [header, values[indexes[header]]?.trim() ?? '']),
        );
        const payload = this.toPayload(raw);
        const errors = this.validate(payload);
        const key = normalizedDocumentKey(
          payload.document_no ?? undefined,
          payload.title,
          payload.issuer,
        );
        if (seen.has(key)) errors.push('文件内重复');
        seen.add(key);
        if (!errors.length && (await this.duplicateExists(payload)))
          errors.push('数据库中已存在相同文号或标题/机构');
        return { row_number: offset + 2, normalized_key: key.slice(0, 300), payload, errors };
      }),
    );
    const validRows = parsed.filter((row) => !row.errors.length).length;
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.regulationImportTask.create({
        data: {
          admin_id: actor.adminId,
          idempotency_key: durableKey,
          file_hash: fileHash,
          original_filename: file.originalname.slice(0, 255),
          file_size: file.size,
          total_rows: parsed.length,
          valid_rows: validRows,
          error_rows: parsed.length - validRows,
          status: parsed.length && !validRows ? IMPORT_STATUS.REJECTED : IMPORT_STATUS.PREVIEW,
        },
      });
      if (parsed.length)
        await tx.regulationImportRow.createMany({
          data: parsed.map((row) => ({
            task_id: created.id,
            row_number: row.row_number,
            normalized_key: row.normalized_key,
            payload: row.payload as unknown as Prisma.InputJsonValue,
            errors: row.errors.length ? (row.errors as Prisma.InputJsonValue) : Prisma.JsonNull,
          })),
        });
      return created;
    });
    return this.detail(task.id, actor.adminId, 1, false);
  }

  async detail(id: bigint, adminId: bigint, role: number, duplicate = false) {
    const task = await this.prisma.regulationImportTask.findFirst({
      where: { id, ...(role === 9 ? {} : { admin_id: adminId }) },
      include: { rows: { orderBy: { row_number: 'asc' }, take: REGULATION_LIMITS.csvRows } },
    });
    if (!task) throw new AppException(54203, '导入任务不存在', HttpStatus.NOT_FOUND);
    return {
      id: task.id.toString(),
      duplicate,
      original_filename: task.original_filename,
      file_size: task.file_size,
      total_rows: task.total_rows,
      valid_rows: task.valid_rows,
      error_rows: task.error_rows,
      status: task.status,
      imported_count: task.imported_count,
      confirmed_at: task.confirmed_at?.toISOString() ?? null,
      rows: task.rows.map((row) => ({
        row_number: row.row_number,
        payload: row.payload,
        errors: row.errors,
        regulation_id: row.regulation_id?.toString() ?? null,
      })),
    };
  }

  async list(adminId: bigint, role: number, query: AdminQueueQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RegulationImportTaskWhereInput = {
      ...(role === 9 ? {} : { admin_id: adminId }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.regulationImportTask.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.regulationImportTask.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        id: item.id.toString(),
        original_filename: item.original_filename,
        total_rows: item.total_rows,
        valid_rows: item.valid_rows,
        error_rows: item.error_rows,
        status: item.status,
        imported_count: item.imported_count,
        created_at: item.created_at.toISOString(),
        confirmed_at: item.confirmed_at?.toISOString() ?? null,
      })),
      pagination: { page, pageSize, total },
    };
  }

  async confirm(id: bigint, reason: string, actor: OperationActorContext) {
    const task = await this.prisma.regulationImportTask.findFirst({
      where: { id, admin_id: actor.adminId },
      include: { rows: { orderBy: { row_number: 'asc' } } },
    });
    if (!task) throw new AppException(54203, '导入任务不存在', HttpStatus.NOT_FOUND);
    if (task.status === IMPORT_STATUS.IMPORTED)
      return { id: task.id.toString(), imported_count: task.imported_count, replayed: true };
    if (task.error_rows || task.status !== IMPORT_STATUS.PREVIEW)
      throw new AppException(54204, '存在错误行，修正后重新上传再确认', HttpStatus.CONFLICT);
    return this.prisma.$transaction(async (tx) => {
      let importedCount = 0;
      for (const row of task.rows) {
        const payload = row.payload as unknown as CsvDraft;
        const duplicate = await tx.regulation.findFirst({
          where: this.duplicateWhere(payload),
          select: { id: true },
        });
        if (duplicate)
          throw new AppException(
            54205,
            `第 ${row.row_number} 行在确认前出现重复数据`,
            HttpStatus.CONFLICT,
          );
        const regulation = await tx.regulation.create({
          data: {
            title: payload.title,
            normalized_title: normalizeRegulationText(payload.title),
            document_no: payload.document_no,
            document_no_empty_reason: payload.document_no_empty_reason,
            normalized_document_no: payload.document_no
              ? normalizeDocumentNo(payload.document_no)
              : null,
            issuer: payload.issuer,
            normalized_issuer: normalizeRegulationText(payload.issuer),
            authority_level: payload.authority_level,
            category: payload.category,
            scope: payload.scope,
            source_url: payload.source_url,
            published_at: payload.published_at ? new Date(payload.published_at) : null,
            effective_at: payload.effective_at ? new Date(payload.effective_at) : null,
            expired_at: payload.expired_at ? new Date(payload.expired_at) : null,
            effective_note: payload.effective_note,
            last_verified_at: payload.last_verified_at ? new Date(payload.last_verified_at) : null,
            review_cycle_days: payload.review_cycle_days,
            replacement_regulation_id: payload.replacement_regulation_id
              ? BigInt(payload.replacement_regulation_id)
              : null,
            created_by: actor.adminId,
            status: REGULATION_STATUS.DRAFT,
          },
        });
        await tx.regulationRevision.create({
          data: {
            regulation_id: regulation.id,
            version: 1,
            summary: payload.summary,
            content: payload.content,
            source_snapshot: this.snapshot(payload) as unknown as Prisma.InputJsonValue,
            change_note: payload.change_note,
            status: REVISION_STATUS.DRAFT,
            created_by: actor.adminId,
          },
        });
        await tx.regulationImportRow.update({
          where: { id: row.id },
          data: { regulation_id: regulation.id },
        });
        importedCount += 1;
      }
      await tx.regulationImportTask.update({
        where: { id },
        data: {
          status: IMPORT_STATUS.IMPORTED,
          imported_count: importedCount,
          confirmed_at: new Date(),
        },
      });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'regulation.import.confirm',
        objectType: 'regulation_import',
        objectId: id.toString(),
        reason,
        afterSummary: { imported_count: importedCount, status: IMPORT_STATUS.IMPORTED },
      });
      return {
        id: id.toString(),
        imported_count: importedCount,
        replayed: false,
        operation_log_id: log.id,
      };
    });
  }

  private toPayload(raw: Record<string, string>): CsvDraft {
    const regions = raw.regions
      ? raw.regions
          .split('|')
          .filter(Boolean)
          .map((item) => {
            const [region_code, ...name] = item.split(':');
            return { region_code: region_code.trim(), region_name: name.join(':').trim() };
          })
      : [];
    return {
      title: raw.title,
      document_no: raw.document_no || null,
      document_no_empty_reason: raw.document_no_empty_reason || null,
      issuer: raw.issuer,
      authority_level: raw.authority_level,
      category: raw.category,
      scope: raw.scope,
      regions,
      tags: [
        ...new Set(
          raw.tags
            .split('|')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
      source_url: raw.source_url,
      published_at: raw.published_at || null,
      effective_at: raw.effective_at || null,
      expired_at: raw.expired_at || null,
      effective_note: raw.effective_note || null,
      last_verified_at: raw.last_verified_at || null,
      review_cycle_days: Number(raw.review_cycle_days || (raw.scope === 'NATIONAL' ? 90 : 30)),
      replacement_regulation_id: raw.replacement_regulation_id || null,
      summary: raw.summary,
      content: raw.content,
      change_note: raw.change_note,
    };
  }

  private validate(payload: CsvDraft): string[] {
    const errors: string[] = [];
    if (payload.title.length < 2 || payload.title.length > 200) errors.push('标题长度应为 2-200');
    if (!payload.document_no && !payload.document_no_empty_reason)
      errors.push('文号与无文号理由不能同时为空');
    if (!payload.issuer || payload.issuer.length > 150) errors.push('发布机构无效');
    if (!AUTHORITY_LEVELS.includes(payload.authority_level as never)) errors.push('效力层级无效');
    if (!REGULATION_CATEGORIES.includes(payload.category as never)) errors.push('分类无效');
    if (!REGULATION_SCOPES.includes(payload.scope as never)) errors.push('scope 无效');
    if (payload.scope === 'NATIONAL' && payload.regions.length) errors.push('全国范围不得填写地区');
    if (payload.scope === 'REGIONAL' && !payload.regions.length)
      errors.push('地方范围必须填写地区');
    if (payload.regions.some((item) => !/^\d{6}$/.test(item.region_code) || !item.region_name))
      errors.push('地区格式应为 6 位代码:名称');
    if (payload.tags.length > REGULATION_LIMITS.tags)
      errors.push(`标签最多 ${REGULATION_LIMITS.tags} 个`);
    try {
      const url = new URL(payload.source_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      errors.push('来源 URL 无效');
    }
    for (const [label, value] of [
      ['发布日期', payload.published_at],
      ['生效日期', payload.effective_at],
      ['失效日期', payload.expired_at],
      ['复核日期', payload.last_verified_at],
    ] as const) {
      if (value && Number.isNaN(new Date(value).getTime())) errors.push(`${label}无效`);
    }
    if (!payload.effective_at && !payload.effective_note) errors.push('生效日期或生效说明必填');
    if (!payload.last_verified_at) errors.push('最后复核时间必填');
    if (
      !Number.isInteger(payload.review_cycle_days) ||
      payload.review_cycle_days < 1 ||
      payload.review_cycle_days > 3650
    )
      errors.push('复核周期无效');
    if (!payload.summary || payload.summary.length > 1000) errors.push('摘要无效');
    if (!payload.content || payload.content.length > REGULATION_LIMITS.content)
      errors.push('正文无效');
    if (payload.change_note.length < 2 || payload.change_note.length > 500)
      errors.push('修订说明无效');
    return errors;
  }

  private duplicateWhere(payload: CsvDraft): Prisma.RegulationWhereInput {
    const normalizedTitle = normalizeRegulationText(payload.title);
    const normalizedIssuer = normalizeRegulationText(payload.issuer);
    return {
      deleted_at: null,
      normalized_title: normalizedTitle,
      normalized_issuer: normalizedIssuer,
    };
  }
  private async duplicateExists(payload: CsvDraft) {
    return Boolean(
      await this.prisma.regulation.findFirst({
        where: this.duplicateWhere(payload),
        select: { id: true },
      }),
    );
  }
  private snapshot(payload: CsvDraft) {
    const snapshot: Partial<CsvDraft> = { ...payload };
    delete snapshot.summary;
    delete snapshot.content;
    delete snapshot.change_note;
    return snapshot;
  }
}
