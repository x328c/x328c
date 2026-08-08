import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateLimitService } from '../common/resilience/rate-limit.service';
import { RegulationFeedbackDto, RegulationListQueryDto, RegulationSearchQueryDto } from './dto';
import {
  AUTHORITY_LEVELS,
  REGULATION_LIMITS,
  REGULATION_STATUS,
  SEARCH_SUGGESTIONS,
} from './regulation.constants';
import { normalizeDocumentNo, normalizeRegulationText } from './regulation-normalizer';

interface ListCursor {
  updatedAt: string;
  id: string;
}
interface SearchCursor extends ListCursor {
  score: number;
  authority: number;
}

const publicInclude = {
  current_revision: { include: { reviewer: { select: { id: true, username: true } } } },
  tag_links: { include: { tag: true } },
  regions: { orderBy: { region_code: 'asc' as const } },
  replacement: { select: { id: true, title: true, status: true } },
} satisfies Prisma.RegulationInclude;

const publicSummaryInclude = {
  current_revision: {
    select: {
      summary: true,
      reviewer: { select: { id: true, username: true } },
    },
  },
  tag_links: { include: { tag: true } },
  regions: { orderBy: { region_code: 'asc' as const } },
  replacement: { select: { id: true, title: true, status: true } },
} satisfies Prisma.RegulationInclude;

type PublicRegulationSummary = Prisma.RegulationGetPayload<{
  include: typeof publicSummaryInclude;
}>;

@Injectable()
export class RegulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async list(query: RegulationListQueryDto) {
    const limit = query.limit ?? REGULATION_LIMITS.pageSize;
    const cursor = query.cursor ? this.decodeCursor<ListCursor>(query.cursor) : undefined;
    const status = query.status ?? REGULATION_STATUS.EFFECTIVE;
    const items = await this.prisma.regulation.findMany({
      where: {
        status,
        deleted_at: null,
        current_revision_id: { not: null },
        ...(query.category ? { category: query.category } : {}),
        ...(query.scope ? { scope: query.scope } : {}),
        ...(query.region_code
          ? {
              AND: [
                {
                  OR: [
                    { scope: 'NATIONAL' },
                    { regions: { some: { region_code: query.region_code } } },
                  ],
                },
              ],
            }
          : {}),
        ...(cursor ? this.listCursorWhere(cursor) : {}),
      },
      include: publicSummaryInclude,
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((item) => this.serializeSummary(item)),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({ updatedAt: last.updated_at.toISOString(), id: last.id.toString() })
          : null,
      hasMore,
      suggestions: page.length ? [] : SEARCH_SUGGESTIONS,
      disclaimer: '本服务仅提供官方信息索引，不构成法律意见。',
    };
  }

  async search(query: RegulationSearchQueryDto) {
    const normalized = normalizeRegulationText(query.keyword);
    if (!normalized) throw new AppException(54001, '请输入有效关键词');
    const status = query.status ?? REGULATION_STATUS.EFFECTIVE;
    const candidates = await this.prisma.regulation.findMany({
      where: {
        status,
        deleted_at: null,
        current_revision_id: { not: null },
        ...(query.category ? { category: query.category } : {}),
        ...(query.scope ? { scope: query.scope } : {}),
        ...(query.region_code
          ? {
              OR: [
                { scope: 'NATIONAL' },
                { regions: { some: { region_code: query.region_code } } },
              ],
            }
          : {}),
      },
      include: publicSummaryInclude,
      take: REGULATION_LIMITS.searchCandidates,
    });
    const cursor = query.cursor ? this.decodeCursor<SearchCursor>(query.cursor) : undefined;
    if (cursor && (!Number.isFinite(cursor.score) || !Number.isFinite(cursor.authority)))
      throw new AppException(54001, '无效的分页游标');
    const ranked = candidates
      .map((item) => ({
        item,
        score: this.score(item, normalized),
        authority: this.authorityWeight(item.authority_level),
      }))
      .filter((row) => row.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.authority - left.authority ||
          right.item.updated_at.getTime() - left.item.updated_at.getTime() ||
          Number(right.item.id - left.item.id),
      )
      .filter((row) => !cursor || this.afterSearchCursor(row, cursor));
    const limit = query.limit ?? REGULATION_LIMITS.pageSize;
    const page = ranked.slice(0, limit);
    const hasMore = ranked.length > limit;
    const last = page.at(-1);
    return {
      items: page.map(({ item, score }) => ({
        ...this.serializeSummary(item),
        matched_fields: this.matchedFields(item, normalized),
        relevance_score: score,
      })),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              score: last.score,
              authority: last.authority,
              updatedAt: last.item.updated_at.toISOString(),
              id: last.item.id.toString(),
            })
          : null,
      hasMore,
      suggestions: page.length ? [] : SEARCH_SUGGESTIONS,
      disclaimer: '未检索到内容时不会自动生成答案；本服务不构成法律意见。',
    };
  }

  async detail(id: bigint) {
    const item = await this.prisma.regulation.findFirst({
      where: { id, deleted_at: null },
      include: publicInclude,
    });
    if (
      !item ||
      !item.current_revision ||
      (
        [
          REGULATION_STATUS.DRAFT,
          REGULATION_STATUS.PENDING_REVIEW,
          REGULATION_STATUS.OFFLINE,
        ] as number[]
      ).includes(item.status)
    ) {
      throw new AppException(
        54002,
        item?.status === REGULATION_STATUS.OFFLINE ? '法规条目已下架' : '法规条目不存在',
        item?.status === REGULATION_STATUS.OFFLINE ? HttpStatus.GONE : HttpStatus.NOT_FOUND,
      );
    }
    const history = await this.prisma.regulationRevision.findMany({
      where: { regulation_id: id, status: 3 },
      select: { id: true, version: true, change_note: true, published_at: true },
      orderBy: { version: 'desc' },
    });
    return {
      ...this.serializeSummary(item),
      summary: item.current_revision.summary,
      content: item.current_revision.content,
      revision: {
        id: item.current_revision.id.toString(),
        version: item.current_revision.version,
        change_note: item.current_revision.change_note,
      },
      revision_history: history.map((revision) => ({
        ...revision,
        id: revision.id.toString(),
        published_at: revision.published_at?.toISOString() ?? null,
      })),
      disclaimer: '内容仅作官方信息索引，请以来源机关公布的原文为准，不构成法律意见。',
    };
  }

  async feedback(regulationId: bigint, userId: bigint, dto: RegulationFeedbackDto) {
    const regulation = await this.prisma.regulation.findFirst({
      where: {
        id: regulationId,
        deleted_at: null,
        current_revision_id: { not: null },
        status: { in: [2, 3, 4] },
      },
      select: { id: true, source_url: true },
    });
    if (!regulation) throw new AppException(54002, '法规条目不存在', HttpStatus.NOT_FOUND);
    await this.rateLimit.consume({
      scope: 'regulation-feedback',
      subject: userId.toString(),
      limit: 10,
      windowSeconds: 3600,
      failClosed: true,
    });
    const feedback = await this.prisma.regulationFeedback.create({
      data: {
        regulation_id: regulationId,
        user_id: userId,
        type: dto.type,
        description: dto.description?.trim() || null,
        source_url: dto.type === 'link_broken' ? regulation.source_url : null,
      },
      select: { id: true, status: true, created_at: true },
    });
    return {
      id: feedback.id.toString(),
      status: feedback.status,
      created_at: feedback.created_at.toISOString(),
    };
  }

  private serializeSummary(item: PublicRegulationSummary) {
    const reviewDueAt = item.last_verified_at
      ? new Date(item.last_verified_at.getTime() + item.review_cycle_days * 86_400_000)
      : null;
    return {
      id: item.id.toString(),
      title: item.title,
      document_no: item.document_no,
      document_no_empty_reason: item.document_no_empty_reason,
      issuer: item.issuer,
      authority_level: item.authority_level,
      category: item.category,
      scope: item.scope,
      regions: item.regions.map((region) => ({
        code: region.region_code,
        name: region.region_name,
      })),
      tags: item.tag_links.map((link) => link.tag.name),
      status: item.status,
      source_url: item.source_url,
      published_at: item.published_at?.toISOString() ?? null,
      effective_at: item.effective_at?.toISOString() ?? null,
      expired_at: item.expired_at?.toISOString() ?? null,
      effective_note: item.effective_note,
      last_verified_at: item.last_verified_at?.toISOString() ?? null,
      review_due_at: reviewDueAt?.toISOString() ?? null,
      review_overdue: !reviewDueAt || reviewDueAt.getTime() < Date.now(),
      reviewer: item.current_revision?.reviewer
        ? {
            id: item.current_revision.reviewer.id.toString(),
            username: item.current_revision.reviewer.username,
          }
        : null,
      summary: item.current_revision?.summary ?? null,
      replacement: item.replacement
        ? {
            id: item.replacement.id.toString(),
            title: item.replacement.title,
            status: item.replacement.status,
          }
        : null,
      updated_at: item.updated_at.toISOString(),
    };
  }

  private score(item: PublicRegulationSummary, query: string): number {
    const tags = item.tag_links.map((link) => link.tag.normalized_name);
    let score = 0;
    if (item.normalized_title === query) score += 120;
    else if (item.normalized_title.startsWith(query)) score += 90;
    else if (item.normalized_title.includes(query)) score += 70;
    const documentQuery = normalizeDocumentNo(query);
    if (item.normalized_document_no === documentQuery) score += 110;
    else if (item.normalized_document_no?.includes(documentQuery)) score += 75;
    if (tags.includes(query)) score += 85;
    else if (tags.some((tag) => tag.includes(query) || query.includes(tag))) score += 55;
    if (item.normalized_issuer === query) score += 65;
    else if (item.normalized_issuer.includes(query)) score += 35;
    return score;
  }

  private matchedFields(item: PublicRegulationSummary, query: string): string[] {
    const fields: string[] = [];
    if (item.normalized_title.includes(query)) fields.push('title');
    if (item.normalized_document_no?.includes(normalizeDocumentNo(query)))
      fields.push('document_no');
    if (item.normalized_issuer.includes(query)) fields.push('issuer');
    if (
      item.tag_links.some(
        (link) =>
          link.tag.normalized_name.includes(query) || query.includes(link.tag.normalized_name),
      )
    )
      fields.push('tag');
    return fields;
  }

  private authorityWeight(level: string): number {
    const index = AUTHORITY_LEVELS.indexOf(level as (typeof AUTHORITY_LEVELS)[number]);
    return index < 0 ? 0 : AUTHORITY_LEVELS.length - index;
  }

  private afterSearchCursor(
    row: { item: PublicRegulationSummary; score: number; authority: number },
    cursor: SearchCursor,
  ): boolean {
    if (row.score !== cursor.score) return row.score < cursor.score;
    if (row.authority !== cursor.authority) return row.authority < cursor.authority;
    const time = row.item.updated_at.toISOString();
    return (
      time < cursor.updatedAt || (time === cursor.updatedAt && row.item.id < BigInt(cursor.id))
    );
  }

  private listCursorWhere(cursor: ListCursor): Prisma.RegulationWhereInput {
    const updatedAt = new Date(cursor.updatedAt);
    return {
      OR: [
        { updated_at: { lt: updatedAt } },
        { updated_at: updatedAt, id: { lt: BigInt(cursor.id) } },
      ],
    };
  }

  private encodeCursor(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
  private decodeCursor<T extends ListCursor>(value: string): T {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
      if (
        !parsed ||
        !/^[1-9]\d*$/.test(parsed.id) ||
        Number.isNaN(new Date(parsed.updatedAt).getTime())
      )
        throw new Error();
      return parsed;
    } catch {
      throw new AppException(54001, '无效的分页游标');
    }
  }
}
