import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSafetyGuideRevisionDto } from './dto/guide.dto';

@Injectable()
export class SafetyGuideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly logs: OperationLogService,
  ) {}

  async current(code: string) {
    await this.flags.assertEnabled('safety_guide.enabled');
    const article = await this.prisma.safetyGuideArticle.findFirst({
      where: { code, status: 1, current_revision_id: { not: null } },
      include: { current_revision: true },
    });
    if (!article?.current_revision)
      throw new AppException(55001, '指南不存在或尚未发布', HttpStatus.NOT_FOUND);
    await this.flags.assertEnabled('safety_guide.enabled');
    const revision = article.current_revision;
    const stale =
      !revision.last_verified_at ||
      Date.now() - revision.last_verified_at.getTime() > 90 * 86400_000;
    return {
      code: article.code,
      title: article.title,
      summary: article.summary,
      version: revision.version,
      content: revision.content_json,
      contentHash: `sha256:${revision.content_hash}`,
      publishedAt: revision.published_at,
      lastVerifiedAt: revision.last_verified_at,
      stale,
      source: {
        title: revision.source_title,
        url: revision.source_url,
        issuer: revision.source_issuer,
        publishedAt: revision.source_published_at,
        effectiveAt: revision.source_effective_at,
      },
      notice: revision.content_note,
    };
  }

  async adminList() {
    const items = await this.prisma.safetyGuideArticle.findMany({
      include: {
        revisions: { orderBy: { created_at: 'desc' }, include: { creator: true, reviewer: true } },
      },
      orderBy: { updated_at: 'desc' },
    });
    return items.map((article) => ({
      id: article.id.toString(),
      code: article.code,
      title: article.title,
      summary: article.summary,
      status: article.status,
      current_revision_id: article.current_revision_id?.toString() ?? null,
      revisions: article.revisions.map((revision) => ({
        id: revision.id.toString(),
        version: revision.version,
        reviewed_at: revision.reviewed_at,
        published_at: revision.published_at,
        created_by: revision.creator?.username ?? '系统初始化',
        reviewed_by: revision.reviewer?.username ?? null,
        last_verified_at: revision.last_verified_at,
        content_json: revision.content_json,
        source_title: revision.source_title,
        source_url: revision.source_url,
        source_issuer: revision.source_issuer,
        source_published_at: revision.source_published_at,
        source_effective_at: revision.source_effective_at,
        content_note: revision.content_note,
      })),
    }));
  }

  async createRevision(dto: CreateSafetyGuideRevisionDto, actor: OperationActorContext) {
    this.validateContent(dto.content_json);
    const contentHash = createHash('sha256').update(JSON.stringify(dto.content_json)).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.safetyGuideArticle.upsert({
        where: { code: dto.code },
        create: { code: dto.code, title: dto.title, summary: dto.summary },
        update: { title: dto.title, summary: dto.summary },
      });
      const duplicate = await tx.safetyGuideRevision.findUnique({
        where: { article_id_version: { article_id: article.id, version: dto.version } },
        select: { id: true },
      });
      if (duplicate)
        throw new AppException(55006, '该版本号已存在，请使用新版本号', HttpStatus.CONFLICT);
      const revision = await tx.safetyGuideRevision.create({
        data: {
          article_id: article.id,
          version: dto.version,
          content_json: dto.content_json as Prisma.InputJsonValue,
          source_title: dto.source_title,
          source_url: dto.source_url,
          source_issuer: dto.source_issuer,
          source_published_at: dto.source_published_at ? new Date(dto.source_published_at) : null,
          source_effective_at: dto.source_effective_at ? new Date(dto.source_effective_at) : null,
          content_note: dto.content_note,
          content_hash: contentHash,
          created_by: actor.adminId,
          last_verified_at: new Date(dto.last_verified_at),
        },
      });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_guide.revision_create',
        objectType: 'safety_guide_revision',
        objectId: revision.id.toString(),
        reason: dto.content_note,
        afterSummary: { code: dto.code, version: dto.version, content_hash: contentHash },
      });
      return {
        id: revision.id.toString(),
        article_id: article.id.toString(),
        content_hash: `sha256:${contentHash}`,
      };
    });
  }

  async review(revisionId: bigint, actor: OperationActorContext, reason: string) {
    const revision = await this.prisma.safetyGuideRevision.findUnique({
      where: { id: revisionId },
    });
    if (!revision) throw new AppException(55001, '指南修订不存在', HttpStatus.NOT_FOUND);
    if (revision.published_at)
      throw new AppException(55004, '已发布修订不可重复复核', HttpStatus.CONFLICT);
    if (revision.reviewed_at)
      throw new AppException(55004, '该修订已完成复核', HttpStatus.CONFLICT);
    if (revision.created_by === actor.adminId)
      throw new AppException(55002, '创建人与复核人不能相同', HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.safetyGuideRevision.update({
        where: { id: revisionId },
        data: { reviewed_by: actor.adminId, reviewed_at: new Date() },
      });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_guide.review',
        objectType: 'safety_guide_revision',
        objectId: revisionId.toString(),
        reason,
      });
    });
    return { success: true };
  }

  async publish(revisionId: bigint, actor: OperationActorContext, reason: string) {
    const revision = await this.prisma.safetyGuideRevision.findUnique({
      where: { id: revisionId },
    });
    if (!revision) throw new AppException(55001, '指南修订不存在', HttpStatus.NOT_FOUND);
    if (revision.published_at) throw new AppException(55004, '该修订已发布', HttpStatus.CONFLICT);
    if (!revision.reviewed_by || !revision.reviewed_at)
      throw new AppException(55003, '指南必须由另一管理员复核后发布', HttpStatus.CONFLICT);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.safetyGuideRevision.update({
        where: { id: revisionId },
        data: { published_at: now },
      });
      await tx.safetyGuideArticle.update({
        where: { id: revision.article_id },
        data: {
          status: 1,
          current_revision_id: revisionId,
          published_at: now,
          offline_reason: null,
        },
      });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_guide.publish',
        objectType: 'safety_guide_revision',
        objectId: revisionId.toString(),
        reason,
        afterSummary: { version: revision.version, content_hash: revision.content_hash },
      });
    });
    return { success: true };
  }

  async offline(articleId: bigint, actor: OperationActorContext, reason: string) {
    const article = await this.prisma.safetyGuideArticle.findUnique({ where: { id: articleId } });
    if (!article) throw new AppException(55001, '指南不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.safetyGuideArticle.update({
        where: { id: articleId },
        data: { status: 2, offline_reason: reason },
      });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_guide.offline',
        objectType: 'safety_guide_article',
        objectId: articleId.toString(),
        reason,
      });
    });
    return { success: true };
  }

  private validateContent(content: Record<string, unknown>) {
    const alert = content.alert;
    const disclaimer = content.disclaimer;
    const sections = content.sections;
    const validLines = (value: unknown) =>
      value === undefined ||
      (Array.isArray(value) &&
        value.length <= 50 &&
        value.every(
          (line) => typeof line === 'string' && line.trim().length > 0 && line.length <= 1000,
        ));
    const valid =
      typeof alert === 'string' &&
      alert.trim().length >= 2 &&
      alert.length <= 2000 &&
      typeof disclaimer === 'string' &&
      disclaimer.trim().length >= 2 &&
      disclaimer.length <= 2000 &&
      Array.isArray(sections) &&
      sections.length > 0 &&
      sections.length <= 30 &&
      sections.every((section) => {
        if (!section || typeof section !== 'object' || Array.isArray(section)) return false;
        const item = section as Record<string, unknown>;
        return (
          typeof item.title === 'string' &&
          item.title.trim().length > 0 &&
          item.title.length <= 200 &&
          validLines(item.items) &&
          validLines(item.paragraphs) &&
          (Array.isArray(item.items) || Array.isArray(item.paragraphs))
        );
      });
    if (!valid) throw new AppException(55005, '指南内容结构无效', HttpStatus.BAD_REQUEST);
  }
}
