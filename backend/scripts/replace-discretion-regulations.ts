import 'dotenv/config';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { OperationLogService } from '../src/common/operation-log/operation-log.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RateLimitService } from '../src/common/resilience/rate-limit.service';
import { RegulationImportService } from '../src/regulation/regulation-import.service';

const EXPECTED_ROWS = 346;
const TARGET_FILENAME = '自治区道路交通违法行为行政处罚裁量权基准导入文件.csv';
const CSV_PATH = resolve(
  process.cwd(),
  '..',
  'docs',
  '法律法规',
  '脚本文件',
  TARGET_FILENAME,
);
const DOCUMENT_NO = '新公规〔2025〕1号';
const ISSUER = '新疆维吾尔自治区公安厅';
const IDEMPOTENCY_KEY = 'discretion-346-20260808-v2-concise-tags-change-note';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function statusCounts(values: number[]) {
  return Object.fromEntries(
    [...new Set(values)].sort((left, right) => left - right).map((status) => [
      String(status),
      values.filter((value) => value === status).length,
    ]),
  );
}

async function loadTask(prisma: PrismaService, requestedId?: string) {
  const task = requestedId
    ? await prisma.regulationImportTask.findUnique({
        where: { id: BigInt(requestedId) },
        include: { rows: { orderBy: { row_number: 'asc' } } },
      })
    : await prisma.regulationImportTask.findFirst({
        where: {
          original_filename: TARGET_FILENAME,
          imported_count: EXPECTED_ROWS,
        },
        include: { rows: { orderBy: { row_number: 'asc' } } },
        orderBy: { id: 'desc' },
      });
  if (!task) throw new Error('未找到目标法规导入任务');
  if (!requestedId && task.original_filename !== TARGET_FILENAME)
    throw new Error(`导入任务文件不匹配：${task.original_filename}`);
  return task;
}

async function audit(prisma: PrismaService, requestedId?: string) {
  const task = await loadTask(prisma, requestedId);
  const regulationIds = task.rows
    .map((row) => row.regulation_id)
    .filter((id): id is bigint => id !== null);
  const uniqueIds = [...new Set(regulationIds.map(String))].map(BigInt);
  const regulations = uniqueIds.length
    ? await prisma.regulation.findMany({
        where: { id: { in: uniqueIds } },
        include: {
          revisions: { select: { status: true, source_snapshot: true, change_note: true } },
          _count: { select: { feedbacks: true } },
        },
        orderBy: { id: 'asc' },
      })
    : [];
  const externalReplacements = uniqueIds.length
    ? await prisma.regulation.count({
        where: {
          replacement_regulation_id: { in: uniqueIds },
          id: { notIn: uniqueIds },
        },
      })
    : 0;
  const revisionChecks = regulations.flatMap((regulation) =>
    regulation.revisions.map((revision) => {
      const snapshot = revision.source_snapshot as { tags?: unknown };
      const tags = Array.isArray(snapshot.tags)
        ? snapshot.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      const violationCode = revision.change_note.match(
        /^由《自治区道路交通违法行为行政处罚裁量权基准》(.+)号违法行为行结构化导入，待另一管理员复核后发布。$/u,
      )?.[1] ?? '';
      const expectedChangeNote = `由《自治区道路交通违法行为行政处罚裁量权基准》${violationCode}号违法行为行结构化导入，待另一管理员复核后发布。`;
      return {
        tags,
        changeNoteMatches:
          Boolean(violationCode) &&
          regulation.title.startsWith(violationCode) &&
          revision.change_note === expectedChangeNote,
        usesOldChangeNote: revision.change_note.includes('Excel 第'),
        usesOldLongBaseTag: tags.includes('自治区道路交通违法行为行政处罚裁量权基准'),
      };
    }),
  );
  const result = {
    task_id: task.id.toString(),
    admin_id: task.admin_id.toString(),
    task_status: task.status,
    imported_count: task.imported_count,
    task_rows: task.rows.length,
    linked_rows: regulationIds.length,
    unique_linked_regulations: uniqueIds.length,
    existing_regulations: regulations.length,
    regulation_id_min: regulations[0]?.id.toString() ?? null,
    regulation_id_max: regulations.at(-1)?.id.toString() ?? null,
    regulation_status_counts: statusCounts(regulations.map((item) => item.status)),
    revision_status_counts: statusCounts(
      regulations.flatMap((item) => item.revisions.map((revision) => revision.status)),
    ),
    feedback_count: regulations.reduce((sum, item) => sum + item._count.feedbacks, 0),
    external_replacement_references: externalReplacements,
    document_mismatch_count: regulations.filter((item) => item.document_no !== DOCUMENT_NO).length,
    issuer_mismatch_count: regulations.filter((item) => item.issuer !== ISSUER).length,
    concise_tag_mismatch_count: revisionChecks.filter(
      (item) =>
        !item.tags.includes('交通违法裁量基准') ||
        item.tags.length < 2 ||
        item.tags.length > 12 ||
        item.tags.some((tag) => tag.length > 50),
    ).length,
    change_note_mismatch_count: revisionChecks.filter((item) => !item.changeNoteMatches).length,
    old_change_note_count: revisionChecks.filter((item) => item.usesOldChangeNote).length,
    old_long_base_tag_count: revisionChecks.filter((item) => item.usesOldLongBaseTag).length,
    max_tags_per_revision: Math.max(0, ...revisionChecks.map((item) => item.tags.length)),
    max_tag_length: Math.max(
      0,
      ...revisionChecks.flatMap((item) => item.tags.map((tag) => tag.length)),
    ),
  };
  return { task, uniqueIds, regulations, result };
}

function assertDeletable(auditResult: Awaited<ReturnType<typeof audit>>) {
  const { task, uniqueIds, regulations, result } = auditResult;
  const failures = [
    task.imported_count !== EXPECTED_ROWS && `导入数不是 ${EXPECTED_ROWS}`,
    task.rows.length !== EXPECTED_ROWS && `导入行不是 ${EXPECTED_ROWS}`,
    uniqueIds.length !== EXPECTED_ROWS && `唯一法规 ID 不是 ${EXPECTED_ROWS}`,
    regulations.length !== EXPECTED_ROWS && `现存法规不是 ${EXPECTED_ROWS}`,
    result.document_mismatch_count !== 0 && '存在文号不匹配',
    result.issuer_mismatch_count !== 0 && '存在发布机构不匹配',
    result.external_replacement_references !== 0 && '存在批次外法规引用目标法规为替代法规',
  ].filter(Boolean);
  if (failures.length) throw new Error(`拒绝删除：${failures.join('；')}`);
}

async function cleanup(prisma: PrismaService, operationLogs: OperationLogService, taskId?: string) {
  if (argument('confirm-delete') !== String(EXPECTED_ROWS)) {
    throw new Error(`删除必须显式传入 --confirm-delete=${EXPECTED_ROWS}`);
  }
  const audited = await audit(prisma, taskId);
  assertDeletable(audited);
  const { task, uniqueIds, result } = audited;
  const requestId = `local-discretion-delete-${randomUUID()}`.slice(0, 64);
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.regulation.updateMany({
      where: { id: { in: uniqueIds } },
      data: { current_revision_id: null, replacement_regulation_id: null },
    });
    const feedbacks = await tx.regulationFeedback.deleteMany({
      where: { regulation_id: { in: uniqueIds } },
    });
    await tx.regulationImportTask.delete({ where: { id: task.id } });
    const regulations = await tx.regulation.deleteMany({ where: { id: { in: uniqueIds } } });
    const log = await operationLogs.appendWithClient(tx, {
      adminId: task.admin_id,
      action: 'regulation.import.rollback.local',
      objectType: 'regulation_import',
      objectId: task.id.toString(),
      reason: '按用户要求撤回旧版裁量权基准逐行导入，准备以精简标签和新版修订说明重新导入',
      requestId,
      ipAddress: '127.0.0.1',
      beforeSummary: result,
      afterSummary: {
        deleted_regulations: regulations.count,
        deleted_feedbacks: feedbacks.count,
        deleted_import_task: task.id.toString(),
      },
    });
    return {
      deleted_regulations: regulations.count,
      deleted_feedbacks: feedbacks.count,
      deleted_import_task: task.id.toString(),
      operation_log_id: log.id,
      admin_id: task.admin_id.toString(),
    };
  });
  return { deleted, adminId: task.admin_id };
}

async function reimport(
  prisma: PrismaService,
  operationLogs: OperationLogService,
  adminId: bigint,
) {
  const buffer = await readFile(CSV_PATH);
  const importService = new RegulationImportService(
    prisma,
    operationLogs,
    {
      consume: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 3600 }),
    } as unknown as RateLimitService,
  );
  const preview = await importService.preview(
    {
      buffer,
      originalname: TARGET_FILENAME,
      mimetype: 'text/csv',
      size: buffer.length,
    },
    IDEMPOTENCY_KEY,
    {
      adminId,
      requestId: 'local-discretion-reimport-preview-v2',
      ipAddress: '127.0.0.1',
    },
  );
  if (
    preview.total_rows !== EXPECTED_ROWS ||
    preview.valid_rows !== EXPECTED_ROWS ||
    preview.error_rows !== 0
  ) {
    throw new Error(
      `重新导入预览未通过：总数 ${preview.total_rows}，有效 ${preview.valid_rows}，错误 ${preview.error_rows}`,
    );
  }
  const confirmed = await importService.confirm(
    BigInt(preview.id),
    '精简逐行标签并按违法代码更新修订说明后重新导入草稿',
    {
      adminId,
      requestId: 'local-discretion-reimport-confirm-v2',
      ipAddress: '127.0.0.1',
    },
  );
  return { preview, confirmed };
}

async function main() {
  const command = process.argv[2] ?? 'audit';
  const taskId = argument('task-id');
  const prisma = new PrismaService();
  await prisma.$connect();
  const operationLogs = new OperationLogService(prisma);
  try {
    if (command === 'audit') {
      console.log(JSON.stringify((await audit(prisma, taskId)).result, null, 2));
      return;
    }
    if (command === 'replace') {
      const { deleted, adminId } = await cleanup(prisma, operationLogs, taskId);
      const imported = await reimport(prisma, operationLogs, adminId);
      const after = await audit(prisma, imported.preview.id);
      console.log(JSON.stringify({ deleted, imported: imported.confirmed, after: after.result }, null, 2));
      return;
    }
    throw new Error('命令仅支持 audit 或 replace');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
