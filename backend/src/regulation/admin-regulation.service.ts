import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AdminRegulationQueryDto,
  AdminQueueQueryDto,
  ExpireRegulationDto,
  RegulationDraftDto,
  UpdateRegulationDraftDto,
} from './dto';
import { REGULATION_SCOPES, REGULATION_STATUS, REVISION_STATUS } from './regulation.constants';
import { normalizeDocumentNo, normalizeRegulationText } from './regulation-normalizer';

interface RevisionSnapshot {
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
}

const adminInclude = {
  creator: { select: { id: true, username: true } },
  current_revision: { include: { reviewer: { select: { id: true, username: true } } } },
  revisions: {
    include: {
      creator: { select: { id: true, username: true } },
      reviewer: { select: { id: true, username: true } },
    },
    orderBy: { version: 'desc' as const },
  },
  regions: { orderBy: { region_code: 'asc' as const } },
  tag_links: { include: { tag: true } },
} satisfies Prisma.RegulationInclude;

type AdminRegulationRecord = Prisma.RegulationGetPayload<{ include: typeof adminInclude }>;

@Injectable()
export class AdminRegulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogs: OperationLogService,
  ) {}

  async list(query: AdminRegulationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword ? normalizeRegulationText(query.keyword) : undefined;
    const where: Prisma.RegulationWhereInput = {
      deleted_at: null,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.category ? { category: query.category } : {}),
      ...(keyword
        ? {
            OR: [
              { normalized_title: { contains: keyword } },
              { normalized_document_no: { contains: keyword } },
              { normalized_issuer: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.regulation.findMany({
        where,
        include: adminInclude,
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.regulation.count({ where }),
    ]);
    return {
      list: items.map((item) => this.serialize(item)),
      pagination: { page, pageSize, total },
    };
  }

  async detail(id: bigint) {
    const regulation = await this.find(id);
    return this.serialize(regulation, true);
  }

  async permanentlyDelete(ids: bigint[], reason: string, actor: OperationActorContext) {
    const uniqueIds = [...new Set(ids.map((id) => id.toString()))].map((id) => BigInt(id));
    if (!uniqueIds.length || uniqueIds.length !== ids.length || uniqueIds.length > 100) {
      throw new AppException(54122, '法规 ID 不能重复，且单次最多删除 100 条');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const regulations = await tx.regulation.findMany({
          where: { id: { in: uniqueIds }, deleted_at: null },
          select: { id: true, title: true, document_no: true, current_revision_id: true },
          orderBy: { id: 'asc' },
        });
        if (regulations.length !== uniqueIds.length) {
          throw new AppException(54120, '法规删除目标不存在', HttpStatus.NOT_FOUND);
        }

        await tx.regulationImportRow.updateMany({
          where: { regulation_id: { in: uniqueIds } },
          data: { regulation_id: null },
        });
        await tx.regulationFeedback.deleteMany({ where: { regulation_id: { in: uniqueIds } } });
        await tx.regulation.updateMany({
          where: { replacement_regulation_id: { in: uniqueIds } },
          data: { replacement_regulation_id: null },
        });
        await tx.regulation.updateMany({
          where: { id: { in: uniqueIds } },
          data: { current_revision_id: null, replacement_regulation_id: null },
        });
        await tx.regulation.deleteMany({ where: { id: { in: uniqueIds } } });
        await tx.regulationTag.deleteMany({ where: { links: { none: {} } } });

        const log = await this.operationLogs.appendWithClient(tx, {
          ...actor,
          action: uniqueIds.length === 1 ? 'regulation.delete' : 'regulation.batch_delete',
          objectType: 'regulation',
          objectId: uniqueIds.length === 1 ? uniqueIds[0].toString() : 'batch',
          reason,
          beforeSummary: {
            count: regulations.length,
            items: regulations.map((item) => ({
              id: item.id.toString(),
              title: item.title,
              document_no: item.document_no,
            })),
          },
          afterSummary: { deleted_count: regulations.length },
        });
        return {
          count: regulations.length,
          ids: regulations.map((item) => item.id.toString()),
          operation_log_id: log.id,
        };
      });
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(54123, '法规删除事务失败', HttpStatus.CONFLICT);
    }
  }

  async feedbacks(query: AdminQueueQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RegulationFeedbackWhereInput =
      query.status === undefined ? {} : { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.regulationFeedback.findMany({
        where,
        include: {
          regulation: { select: { id: true, title: true, source_url: true } },
          user: { select: { id: true, nickname: true } },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.regulationFeedback.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        id: item.id.toString(),
        regulation: { ...item.regulation, id: item.regulation.id.toString() },
        user: { ...item.user, id: item.user.id.toString() },
        type: item.type,
        description: item.description,
        source_url: item.source_url,
        status: item.status,
        created_at: item.created_at.toISOString(),
      })),
      pagination: { page, pageSize, total },
    };
  }

  async resolveFeedback(id: bigint, reason: string, actor: OperationActorContext) {
    const feedback = await this.prisma.regulationFeedback.findUnique({ where: { id } });
    if (!feedback) throw new AppException(54112, '纠错反馈不存在', HttpStatus.NOT_FOUND);
    if (feedback.status === 1) return { id: id.toString(), status: 1, replayed: true };
    return this.prisma.$transaction(async (tx) => {
      await tx.regulationFeedback.update({ where: { id }, data: { status: 1 } });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'regulation.feedback.resolve',
        objectType: 'regulation_feedback',
        objectId: id.toString(),
        reason,
        beforeSummary: {
          status: feedback.status,
          type: feedback.type,
          regulation_id: feedback.regulation_id.toString(),
        },
        afterSummary: { status: 1 },
      });
      return { id: id.toString(), status: 1, replayed: false, operation_log_id: log.id };
    });
  }

  async create(dto: RegulationDraftDto, actor: OperationActorContext) {
    const snapshot = this.snapshotFromCreate(dto);
    this.validateScope(snapshot);
    const result = await this.prisma.$transaction(async (tx) => {
      const regulation = await tx.regulation.create({
        data: {
          ...this.containerData(snapshot),
          created_by: actor.adminId,
          status: REGULATION_STATUS.DRAFT,
        },
      });
      const revision = await tx.regulationRevision.create({
        data: {
          regulation_id: regulation.id,
          version: 1,
          summary: dto.summary.trim(),
          content: dto.content,
          source_snapshot: snapshot as unknown as Prisma.InputJsonValue,
          change_note: dto.change_note.trim(),
          status: REVISION_STATUS.DRAFT,
          created_by: actor.adminId,
        },
      });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'regulation.create',
        objectType: 'regulation',
        objectId: regulation.id.toString(),
        reason: dto.change_note,
        afterSummary: this.auditSummary(snapshot, 1, REVISION_STATUS.DRAFT),
      });
      return {
        id: regulation.id.toString(),
        revision_id: revision.id.toString(),
        version: 1,
        operation_log_id: log.id,
      };
    });
    return result;
  }

  async update(id: bigint, dto: UpdateRegulationDraftDto, actor: OperationActorContext) {
    const regulation = await this.find(id);
    const latest = regulation.revisions[0];
    if (!latest) throw new AppException(54102, '法规修订不存在', HttpStatus.CONFLICT);
    const base = this.readSnapshot(latest.source_snapshot);
    const next = this.mergeSnapshot(base, dto);
    this.validateScope(next);
    const createsRevision = latest.status !== REVISION_STATUS.DRAFT;
    const result = await this.prisma.$transaction(async (tx) => {
      const revision = createsRevision
        ? await tx.regulationRevision.create({
            data: {
              regulation_id: id,
              version: latest.version + 1,
              summary:
                dto.summary?.trim() ?? regulation.current_revision?.summary ?? latest.summary,
              content: dto.content ?? regulation.current_revision?.content ?? latest.content,
              source_snapshot: next as unknown as Prisma.InputJsonValue,
              change_note: dto.change_note?.trim() ?? '创建新修订',
              status: REVISION_STATUS.DRAFT,
              created_by: actor.adminId,
            },
          })
        : await tx.regulationRevision.update({
            where: { id: latest.id },
            data: {
              summary: dto.summary?.trim() ?? latest.summary,
              content: dto.content ?? latest.content,
              source_snapshot: next as unknown as Prisma.InputJsonValue,
              change_note: dto.change_note?.trim() ?? latest.change_note,
            },
          });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: createsRevision ? 'regulation.revision.create' : 'regulation.draft.update',
        objectType: 'regulation',
        objectId: id.toString(),
        reason: dto.change_note ?? '保存法规草稿',
        beforeSummary: this.auditSummary(base, latest.version, latest.status),
        afterSummary: this.auditSummary(next, revision.version, revision.status),
      });
      return {
        id: id.toString(),
        revision_id: revision.id.toString(),
        version: revision.version,
        operation_log_id: log.id,
      };
    });
    return result;
  }

  async submitReview(id: bigint, reason: string, actor: OperationActorContext) {
    const regulation = await this.find(id);
    const latest = regulation.revisions[0];
    if (!latest || latest.status !== REVISION_STATUS.DRAFT)
      throw new AppException(54103, '仅草稿修订可提交复核', HttpStatus.CONFLICT);
    return this.prisma.$transaction(async (tx) => {
      await tx.regulationRevision.update({
        where: { id: latest.id },
        data: { status: REVISION_STATUS.PENDING_REVIEW },
      });
      if (!regulation.current_revision_id)
        await tx.regulation.update({
          where: { id },
          data: { status: REGULATION_STATUS.PENDING_REVIEW },
        });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'regulation.submit_review',
        objectType: 'regulation',
        objectId: id.toString(),
        reason,
        afterSummary: { version: latest.version, revision_status: REVISION_STATUS.PENDING_REVIEW },
      });
      return {
        id: id.toString(),
        version: latest.version,
        revision_status: REVISION_STATUS.PENDING_REVIEW,
        operation_log_id: log.id,
      };
    });
  }

  async batchSubmitReview(ids: bigint[], reason: string, actor: OperationActorContext) {
    const regulations = await this.findManyForBatch(ids);
    for (const regulation of regulations) {
      const latest = regulation.revisions[0];
      if (!latest || latest.status !== REVISION_STATUS.DRAFT) {
        throw new AppException(
          54103,
          `仅草稿修订可提交复核：法规 ${regulation.id.toString()}`,
          HttpStatus.CONFLICT,
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const operationLogIds: string[] = [];
      for (const regulation of regulations) {
        const latest = regulation.revisions[0]!;
        await tx.regulationRevision.update({
          where: { id: latest.id },
          data: { status: REVISION_STATUS.PENDING_REVIEW },
        });
        if (!regulation.current_revision_id) {
          await tx.regulation.update({
            where: { id: regulation.id },
            data: { status: REGULATION_STATUS.PENDING_REVIEW },
          });
        }
        const log = await this.operationLogs.appendWithClient(tx, {
          ...actor,
          action: 'regulation.submit_review',
          objectType: 'regulation',
          objectId: regulation.id.toString(),
          reason,
          afterSummary: {
            version: latest.version,
            revision_status: REVISION_STATUS.PENDING_REVIEW,
            batch_size: regulations.length,
          },
        });
        operationLogIds.push(log.id);
      }
      return {
        count: regulations.length,
        ids: regulations.map((regulation) => regulation.id.toString()),
        operation_log_ids: operationLogIds,
      };
    });
  }

  async review(id: bigint, reason: string, actor: OperationActorContext) {
    const regulation = await this.find(id);
    const latest = regulation.revisions[0];
    if (!latest || latest.status !== REVISION_STATUS.PENDING_REVIEW)
      throw new AppException(54104, '当前修订不在待复核状态', HttpStatus.CONFLICT);
    if (latest.created_by === actor.adminId)
      throw new AppException(54105, '录入人与复核人不能相同', HttpStatus.FORBIDDEN);
    return this.prisma.$transaction(async (tx) => {
      await tx.regulationRevision.update({
        where: { id: latest.id },
        data: {
          status: REVISION_STATUS.APPROVED,
          reviewed_by: actor.adminId,
          reviewed_at: new Date(),
        },
      });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'regulation.review.approve',
        objectType: 'regulation',
        objectId: id.toString(),
        reason,
        afterSummary: {
          version: latest.version,
          revision_status: REVISION_STATUS.APPROVED,
          reviewed_by: actor.adminId.toString(),
        },
      });
      return {
        id: id.toString(),
        version: latest.version,
        revision_status: REVISION_STATUS.APPROVED,
        operation_log_id: log.id,
      };
    });
  }

  async batchReview(ids: bigint[], reason: string, actor: OperationActorContext) {
    const regulations = await this.findManyForBatch(ids);
    for (const regulation of regulations) {
      const latest = regulation.revisions[0];
      if (!latest || latest.status !== REVISION_STATUS.PENDING_REVIEW) {
        throw new AppException(
          54104,
          `当前修订不在待复核状态：法规 ${regulation.id.toString()}`,
          HttpStatus.CONFLICT,
        );
      }
      if (latest.created_by === actor.adminId) {
        throw new AppException(
          54105,
          `录入人与复核人不能相同：法规 ${regulation.id.toString()}`,
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return this.prisma.$transaction(
      async (tx) => {
        const reviewedAt = new Date();
        const operationLogIds: string[] = [];
        for (const regulation of regulations) {
          const latest = regulation.revisions[0]!;
          await tx.regulationRevision.update({
            where: { id: latest.id },
            data: {
              status: REVISION_STATUS.APPROVED,
              reviewed_by: actor.adminId,
              reviewed_at: reviewedAt,
            },
          });
          const log = await this.operationLogs.appendWithClient(tx, {
            ...actor,
            action: 'regulation.review.approve',
            objectType: 'regulation',
            objectId: regulation.id.toString(),
            reason,
            afterSummary: {
              version: latest.version,
              revision_status: REVISION_STATUS.APPROVED,
              reviewed_by: actor.adminId.toString(),
              batch_size: regulations.length,
            },
          });
          operationLogIds.push(log.id);
        }
        return {
          count: regulations.length,
          ids: regulations.map((regulation) => regulation.id.toString()),
          operation_log_ids: operationLogIds,
        };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  async publish(id: bigint, reason: string, actor: OperationActorContext) {
    const regulation = await this.find(id);
    const revision = regulation.revisions[0];
    if (
      !revision ||
      revision.status !== REVISION_STATUS.APPROVED ||
      !revision.reviewed_by ||
      revision.reviewed_by === revision.created_by
    ) {
      throw new AppException(54106, '法规必须由另一名管理员复核通过后发布', HttpStatus.CONFLICT);
    }
    const snapshot = this.readSnapshot(revision.source_snapshot);
    this.validatePublish(snapshot, revision.summary, revision.content);
    return this.prisma.$transaction((tx) =>
      this.publishWithClient(tx, regulation, snapshot, reason, actor),
    );
  }

  async batchPublish(ids: bigint[], reason: string, actor: OperationActorContext) {
    const regulations = await this.findManyForBatch(ids);
    const snapshots = regulations.map((regulation) => {
      const revision = regulation.revisions[0];
      if (
        !revision ||
        revision.status !== REVISION_STATUS.APPROVED ||
        !revision.reviewed_by ||
        revision.reviewed_by === revision.created_by
      ) {
        throw new AppException(
          54106,
          `法规必须由另一名管理员复核通过后发布：法规 ${regulation.id.toString()}`,
          HttpStatus.CONFLICT,
        );
      }
      const snapshot = this.readSnapshot(revision.source_snapshot);
      this.validatePublish(snapshot, revision.summary, revision.content);
      return snapshot;
    });
    return this.prisma.$transaction(
      async (tx) => {
        const results = [];
        for (const [index, regulation] of regulations.entries()) {
          results.push(
            await this.publishWithClient(tx, regulation, snapshots[index], reason, actor, {
              batch_size: regulations.length,
            }),
          );
        }
        return {
          count: results.length,
          ids: results.map((result) => result.id),
          operation_log_ids: results.map((result) => result.operation_log_id),
        };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  async expire(id: bigint, dto: ExpireRegulationDto, actor: OperationActorContext) {
    if (dto.replacement_regulation_id)
      await this.validateReplacement(id, BigInt(dto.replacement_regulation_id));
    return this.changeLifecycle(
      id,
      REGULATION_STATUS.EXPIRED,
      'regulation.expire',
      dto.reason,
      actor,
      {
        expired_at: dto.expired_at ? new Date(dto.expired_at) : new Date(),
        replacement_regulation_id: dto.replacement_regulation_id
          ? BigInt(dto.replacement_regulation_id)
          : undefined,
      },
      [REGULATION_STATUS.EFFECTIVE],
    );
  }

  async replace(id: bigint, dto: ExpireRegulationDto, actor: OperationActorContext) {
    if (!dto.replacement_regulation_id) throw new AppException(54107, '标记已替代必须指定替代法规');
    const replacementId = BigInt(dto.replacement_regulation_id);
    await this.validateReplacement(id, replacementId);
    return this.changeLifecycle(
      id,
      REGULATION_STATUS.REPLACED,
      'regulation.replace',
      dto.reason,
      actor,
      {
        expired_at: dto.expired_at ? new Date(dto.expired_at) : new Date(),
        replacement_regulation_id: replacementId,
      },
      [REGULATION_STATUS.EFFECTIVE],
    );
  }

  async offline(id: bigint, reason: string, actor: OperationActorContext) {
    return this.changeLifecycle(
      id,
      REGULATION_STATUS.OFFLINE,
      'regulation.offline',
      reason,
      actor,
      { offlined_at: new Date(), offline_reason: reason },
      [REGULATION_STATUS.EFFECTIVE, REGULATION_STATUS.EXPIRED, REGULATION_STATUS.REPLACED],
    );
  }

  private async changeLifecycle(
    id: bigint,
    status: number,
    action: string,
    reason: string,
    actor: OperationActorContext,
    data: Prisma.RegulationUncheckedUpdateInput,
    allowedStatuses: number[],
  ) {
    const regulation = await this.find(id);
    if (!regulation.current_revision_id || !allowedStatuses.includes(regulation.status))
      throw new AppException(54108, '仅已发布法规可变更生命周期', HttpStatus.CONFLICT);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.regulation.update({ where: { id }, data: { ...data, status } });
      const log = await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action,
        objectType: 'regulation',
        objectId: id.toString(),
        reason,
        beforeSummary: this.lifecycleSummary(regulation),
        afterSummary: {
          status: updated.status,
          expired_at: updated.expired_at?.toISOString() ?? null,
          replacement_regulation_id: updated.replacement_regulation_id?.toString() ?? null,
        },
      });
      return { id: id.toString(), status: updated.status, operation_log_id: log.id };
    });
  }

  private async find(id: bigint) {
    const regulation = await this.prisma.regulation.findFirst({
      where: { id, deleted_at: null },
      include: adminInclude,
    });
    if (!regulation) throw new AppException(54101, '法规条目不存在', HttpStatus.NOT_FOUND);
    return regulation;
  }

  private async findManyForBatch(ids: bigint[]) {
    const found = await this.prisma.regulation.findMany({
      where: { id: { in: ids }, deleted_at: null },
      include: adminInclude,
    });
    const byId = new Map(found.map((regulation) => [regulation.id.toString(), regulation]));
    const missing = ids.filter((id) => !byId.has(id.toString()));
    if (missing.length) {
      throw new AppException(
        54101,
        `法规条目不存在：${missing.map(String).join('、')}`,
        HttpStatus.NOT_FOUND,
      );
    }
    return ids.map((id) => byId.get(id.toString())!);
  }

  private async publishWithClient(
    tx: Prisma.TransactionClient,
    regulation: AdminRegulationRecord,
    snapshot: RevisionSnapshot,
    reason: string,
    actor: OperationActorContext,
    auditExtra: Record<string, unknown> = {},
  ) {
    const id = regulation.id;
    const revision = regulation.revisions[0]!;
    const before = this.lifecycleSummary(regulation);
    await tx.regulationTagLink.deleteMany({ where: { regulation_id: id } });
    await tx.regulationRegion.deleteMany({ where: { regulation_id: id } });
    const tagCreates = await Promise.all(
      snapshot.tags.map(async (name) => {
        const normalized = normalizeRegulationText(name);
        const tag = await tx.regulationTag.upsert({
          where: { normalized_name: normalized },
          create: { name: name.trim(), normalized_name: normalized },
          update: { name: name.trim() },
        });
        return { regulation_id: id, tag_id: tag.id };
      }),
    );
    if (tagCreates.length)
      await tx.regulationTagLink.createMany({ data: tagCreates, skipDuplicates: true });
    if (snapshot.regions.length)
      await tx.regulationRegion.createMany({
        data: snapshot.regions.map((region) => ({ regulation_id: id, ...region })),
      });
    const now = new Date();
    const publicationSnapshot: RevisionSnapshot = {
      ...snapshot,
      published_at: snapshot.published_at ?? now.toISOString(),
      expired_at: null,
      replacement_regulation_id: null,
    };
    await tx.regulationRevision.update({
      where: { id: revision.id },
      data: {
        status: REVISION_STATUS.PUBLISHED,
        published_at: now,
        source_snapshot: publicationSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
    const published = await tx.regulation.update({
      where: { id },
      data: {
        ...this.containerData(publicationSnapshot),
        status: REGULATION_STATUS.EFFECTIVE,
        current_revision_id: revision.id,
        published_at: new Date(publicationSnapshot.published_at!),
        offlined_at: null,
        offline_reason: null,
      },
    });
    const log = await this.operationLogs.appendWithClient(tx, {
      ...actor,
      action: 'regulation.publish',
      objectType: 'regulation',
      objectId: id.toString(),
      reason,
      beforeSummary: before,
      afterSummary: {
        status: published.status,
        version: revision.version,
        current_revision_id: revision.id.toString(),
        ...auditExtra,
      },
    });
    return {
      id: id.toString(),
      status: published.status,
      version: revision.version,
      operation_log_id: log.id,
    };
  }

  private snapshotFromCreate(dto: RegulationDraftDto): RevisionSnapshot {
    return {
      title: dto.title.trim(),
      document_no: dto.document_no?.trim() || null,
      document_no_empty_reason: dto.document_no_empty_reason?.trim() || null,
      issuer: dto.issuer.trim(),
      authority_level: dto.authority_level,
      category: dto.category,
      scope: dto.scope,
      regions: dto.regions.map((region) => ({
        region_code: region.region_code,
        region_name: region.region_name.trim(),
      })),
      tags: [...new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean))],
      source_url: dto.source_url?.trim() ?? '',
      published_at: dto.published_at ?? null,
      effective_at: dto.effective_at ?? null,
      expired_at: dto.expired_at ?? null,
      effective_note: dto.effective_note?.trim() || null,
      last_verified_at: dto.last_verified_at ?? null,
      review_cycle_days: dto.review_cycle_days ?? (dto.scope === 'NATIONAL' ? 90 : 30),
      replacement_regulation_id: dto.replacement_regulation_id ?? null,
    };
  }

  private mergeSnapshot(base: RevisionSnapshot, dto: UpdateRegulationDraftDto): RevisionSnapshot {
    return {
      ...base,
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.document_no !== undefined ? { document_no: dto.document_no?.trim() || null } : {}),
      ...(dto.document_no_empty_reason !== undefined
        ? { document_no_empty_reason: dto.document_no_empty_reason?.trim() || null }
        : {}),
      ...(dto.issuer !== undefined ? { issuer: dto.issuer.trim() } : {}),
      ...(dto.authority_level !== undefined ? { authority_level: dto.authority_level } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
      ...(dto.regions !== undefined
        ? {
            regions: dto.regions.map((region) => ({
              region_code: region.region_code,
              region_name: region.region_name.trim(),
            })),
          }
        : {}),
      ...(dto.tags !== undefined
        ? { tags: [...new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean))] }
        : {}),
      ...(dto.source_url !== undefined ? { source_url: dto.source_url.trim() } : {}),
      ...(dto.published_at !== undefined ? { published_at: dto.published_at } : {}),
      ...(dto.effective_at !== undefined ? { effective_at: dto.effective_at } : {}),
      ...(dto.expired_at !== undefined ? { expired_at: dto.expired_at } : {}),
      ...(dto.effective_note !== undefined
        ? { effective_note: dto.effective_note?.trim() || null }
        : {}),
      ...(dto.last_verified_at !== undefined ? { last_verified_at: dto.last_verified_at } : {}),
      ...(dto.review_cycle_days !== undefined ? { review_cycle_days: dto.review_cycle_days } : {}),
      ...(dto.replacement_regulation_id !== undefined
        ? { replacement_regulation_id: dto.replacement_regulation_id }
        : {}),
    };
  }

  private containerData(
    snapshot: RevisionSnapshot,
  ): Omit<Prisma.RegulationUncheckedCreateInput, 'created_by'> {
    return {
      title: snapshot.title,
      normalized_title: normalizeRegulationText(snapshot.title),
      document_no: snapshot.document_no,
      document_no_empty_reason: snapshot.document_no_empty_reason,
      normalized_document_no: snapshot.document_no
        ? normalizeDocumentNo(snapshot.document_no)
        : null,
      issuer: snapshot.issuer,
      normalized_issuer: normalizeRegulationText(snapshot.issuer),
      authority_level: snapshot.authority_level,
      category: snapshot.category,
      scope: snapshot.scope,
      source_url: snapshot.source_url,
      effective_at: snapshot.effective_at ? new Date(snapshot.effective_at) : null,
      expired_at: snapshot.expired_at ? new Date(snapshot.expired_at) : null,
      effective_note: snapshot.effective_note,
      last_verified_at: snapshot.last_verified_at ? new Date(snapshot.last_verified_at) : null,
      review_cycle_days: snapshot.review_cycle_days,
      replacement_regulation_id: snapshot.replacement_regulation_id
        ? BigInt(snapshot.replacement_regulation_id)
        : null,
    };
  }

  private validateScope(snapshot: RevisionSnapshot) {
    if (!REGULATION_SCOPES.includes(snapshot.scope as (typeof REGULATION_SCOPES)[number]))
      throw new AppException(54109, '适用范围无效');
    if (snapshot.scope === 'NATIONAL' && snapshot.regions.length)
      throw new AppException(54109, '全国范围不得同时填写地区');
    if (snapshot.scope === 'REGIONAL' && !snapshot.regions.length)
      throw new AppException(54109, '地方范围必须填写适用地区');
    const codes = snapshot.regions.map((region) => region.region_code);
    if (new Set(codes).size !== codes.length) throw new AppException(54109, '适用地区不能重复');
  }

  private validatePublish(snapshot: RevisionSnapshot, summary: string, content: string) {
    this.validateScope(snapshot);
    const missing = [
      !snapshot.title && '标题',
      !snapshot.document_no && !snapshot.document_no_empty_reason && '文号或无文号理由',
      !snapshot.issuer && '发布机构',
      !snapshot.authority_level && '效力层级',
      !snapshot.source_url && '来源 URL',
      !snapshot.effective_at && !snapshot.effective_note && '生效信息',
      !snapshot.last_verified_at && '最后复核时间',
      !summary && '摘要',
      !content && '正文',
    ].filter(Boolean);
    if (missing.length) throw new AppException(54110, `发布字段不完整：${missing.join('、')}`);
    try {
      const source = new URL(snapshot.source_url);
      if (!['http:', 'https:'].includes(source.protocol)) throw new Error('invalid protocol');
    } catch {
      throw new AppException(54110, '发布字段不完整：来源 URL 无效');
    }
  }

  private async validateReplacement(regulationId: bigint, replacementId: bigint) {
    if (regulationId === replacementId) throw new AppException(54113, '法规不能替代自身');
    const replacement = await this.prisma.regulation.findFirst({
      where: {
        id: replacementId,
        status: REGULATION_STATUS.EFFECTIVE,
        current_revision_id: { not: null },
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!replacement) throw new AppException(54113, '替代法规必须是另一条现行有效内容');
  }

  private readSnapshot(value: Prisma.JsonValue): RevisionSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new AppException(54111, '修订来源快照损坏', HttpStatus.CONFLICT);
    return value as unknown as RevisionSnapshot;
  }

  private auditSummary(snapshot: RevisionSnapshot, version: number, revisionStatus: number) {
    return {
      title: snapshot.title,
      document_no: snapshot.document_no,
      issuer: snapshot.issuer,
      scope: snapshot.scope,
      region_codes: snapshot.regions.map((item) => item.region_code),
      version,
      revision_status: revisionStatus,
    };
  }
  private lifecycleSummary(regulation: {
    status: number;
    current_revision_id: bigint | null;
    expired_at: Date | null;
    replacement_regulation_id: bigint | null;
  }) {
    return {
      status: regulation.status,
      current_revision_id: regulation.current_revision_id?.toString() ?? null,
      expired_at: regulation.expired_at?.toISOString() ?? null,
      replacement_regulation_id: regulation.replacement_regulation_id?.toString() ?? null,
    };
  }

  private serialize(
    regulation: Prisma.RegulationGetPayload<{ include: typeof adminInclude }>,
    includeContent = false,
  ) {
    const revisions = regulation.revisions.map((revision) => ({
      id: revision.id.toString(),
      version: revision.version,
      summary: revision.summary,
      ...(includeContent
        ? { content: revision.content, source_snapshot: revision.source_snapshot }
        : {}),
      change_note: revision.change_note,
      status: revision.status,
      creator: { ...revision.creator, id: revision.creator.id.toString() },
      reviewer: revision.reviewer
        ? { ...revision.reviewer, id: revision.reviewer.id.toString() }
        : null,
      reviewed_at: revision.reviewed_at?.toISOString() ?? null,
      published_at: revision.published_at?.toISOString() ?? null,
      created_at: revision.created_at.toISOString(),
    }));
    return {
      id: regulation.id.toString(),
      title: regulation.title,
      document_no: regulation.document_no,
      document_no_empty_reason: regulation.document_no_empty_reason,
      issuer: regulation.issuer,
      authority_level: regulation.authority_level,
      category: regulation.category,
      scope: regulation.scope,
      source_url: regulation.source_url,
      status: regulation.status,
      published_at: regulation.published_at?.toISOString() ?? null,
      effective_at: regulation.effective_at?.toISOString() ?? null,
      expired_at: regulation.expired_at?.toISOString() ?? null,
      effective_note: regulation.effective_note,
      last_verified_at: regulation.last_verified_at?.toISOString() ?? null,
      review_cycle_days: regulation.review_cycle_days,
      current_revision_id: regulation.current_revision_id?.toString() ?? null,
      replacement_regulation_id: regulation.replacement_regulation_id?.toString() ?? null,
      offline_reason: regulation.offline_reason,
      creator: { ...regulation.creator, id: regulation.creator.id.toString() },
      tags: regulation.tag_links.map((link) => link.tag.name),
      regions: regulation.regions.map((region) => ({
        region_code: region.region_code,
        region_name: region.region_name,
      })),
      latest_revision: revisions[0] ?? null,
      revisions,
      created_at: regulation.created_at.toISOString(),
      updated_at: regulation.updated_at.toISOString(),
    };
  }
}
