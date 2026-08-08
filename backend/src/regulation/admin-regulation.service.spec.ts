import { AppException } from '../common/exceptions/app.exception';
import { AdminRegulationService } from './admin-regulation.service';
import { REGULATION_STATUS, REVISION_STATUS } from './regulation.constants';

const actor = { adminId: 1n, requestId: 'regulation-test', ipAddress: '127.0.0.1' };
function record(revisionStatus: number, createdBy = 1n, snapshot: Record<string, unknown> = {}) {
  const base = {
    title: '道路交通安全规定',
    document_no: '测试文号',
    document_no_empty_reason: null,
    issuer: '测试机关',
    authority_level: 'law',
    category: 'traffic',
    scope: 'NATIONAL',
    regions: [],
    tags: ['交通安全'],
    source_url: 'https://gov.example/regulation',
    published_at: '2026-01-01',
    effective_at: '2026-02-01',
    expired_at: null,
    effective_note: null,
    last_verified_at: '2026-07-01',
    review_cycle_days: 90,
    replacement_regulation_id: null,
  };
  return {
    id: 1n,
    status:
      revisionStatus === REVISION_STATUS.PUBLISHED
        ? REGULATION_STATUS.EFFECTIVE
        : REGULATION_STATUS.DRAFT,
    current_revision_id: revisionStatus === REVISION_STATUS.PUBLISHED ? 10n : null,
    expired_at: null,
    replacement_regulation_id: null,
    revisions: [
      {
        id: 10n,
        regulation_id: 1n,
        version: 1,
        status: revisionStatus,
        created_by: createdBy,
        reviewed_by: revisionStatus >= 2 ? 2n : null,
        summary: '摘要',
        content: '正文',
        change_note: '初版',
        source_snapshot: { ...base, ...snapshot },
        creator: { id: createdBy, username: 'creator' },
        reviewer: null,
        reviewed_at: null,
        published_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    current_revision:
      revisionStatus === REVISION_STATUS.PUBLISHED ? { summary: '摘要', content: '正文' } : null,
    creator: { id: 1n, username: 'creator' },
    regions: [],
    tag_links: [],
    title: '道路交通安全规定',
    document_no: '测试文号',
    document_no_empty_reason: null,
    issuer: '测试机关',
    authority_level: 'law',
    category: 'traffic',
    scope: 'NATIONAL',
    source_url: 'https://gov.example/regulation',
    published_at: null,
    effective_at: null,
    effective_note: null,
    last_verified_at: null,
    review_cycle_days: 90,
    offline_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };
}

function withId(value: ReturnType<typeof record>, id: bigint) {
  const revisionId = id * 10n;
  return {
    ...value,
    id,
    current_revision_id: value.current_revision_id ? revisionId : null,
    revisions: value.revisions.map((revision) => ({
      ...revision,
      id: revisionId,
      regulation_id: id,
    })),
  };
}

describe('AdminRegulationService workflow', () => {
  const prisma = {
    regulation: { findFirst: jest.fn(), findMany: jest.fn() },
    regulationRevision: {},
    $transaction: jest.fn(),
  };
  const logs = { appendWithClient: jest.fn() };
  const service = new AdminRegulationService(prisma as never, logs as never);
  beforeEach(() => jest.clearAllMocks());

  it('rejects review by the revision creator', async () => {
    prisma.regulation.findFirst.mockResolvedValue(record(REVISION_STATUS.PENDING_REVIEW, 1n));
    await expect(service.review(1n, '复核通过', actor)).rejects.toThrow('录入人与复核人不能相同');
  });

  it('rejects publishing when the official source is missing', async () => {
    prisma.regulation.findFirst.mockResolvedValue(
      record(REVISION_STATUS.APPROVED, 1n, { source_url: '' }),
    );
    await expect(service.publish(1n, '发布', { ...actor, adminId: 9n })).rejects.toBeInstanceOf(
      AppException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a self-referencing replacement before any database mutation', async () => {
    await expect(
      service.replace(1n, { replacement_regulation_id: '1', reason: '错误替代关系' }, actor),
    ).rejects.toThrow('法规不能替代自身');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a new draft revision instead of overwriting a published revision', async () => {
    prisma.regulation.findFirst.mockResolvedValue(record(REVISION_STATUS.PUBLISHED));
    const created = { id: 11n, version: 2, status: REVISION_STATUS.DRAFT };
    const tx = { regulationRevision: { create: jest.fn().mockResolvedValue(created) } };
    logs.appendWithClient.mockResolvedValue({ id: '99' });
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    const result = await service.update(
      1n,
      { content: '第二版正文', change_note: '更新执法条款' },
      { ...actor, adminId: 3n },
    );
    expect(tx.regulationRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          content: '第二版正文',
          status: REVISION_STATUS.DRAFT,
        }),
      }),
    );
    expect(result.version).toBe(2);
  });

  it('batch-submits every draft in one transaction and audits every regulation', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.DRAFT), 1n),
      withId(record(REVISION_STATUS.DRAFT), 2n),
    ]);
    const tx = {
      regulationRevision: { update: jest.fn().mockResolvedValue({}) },
      regulation: { update: jest.fn().mockResolvedValue({}) },
    };
    logs.appendWithClient
      .mockResolvedValueOnce({ id: 'log-1' })
      .mockResolvedValueOnce({ id: 'log-2' });
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    const result = await service.batchSubmitReview([2n, 1n], '批量提交法规复核', actor);

    expect(result).toEqual({
      count: 2,
      ids: ['2', '1'],
      operation_log_ids: ['log-1', 'log-2'],
    });
    expect(tx.regulationRevision.update).toHaveBeenCalledTimes(2);
    expect(tx.regulation.update).toHaveBeenCalledTimes(2);
    expect(logs.appendWithClient).toHaveBeenCalledTimes(2);
  });

  it('rejects a mixed batch before starting a transaction', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.DRAFT), 1n),
      withId(record(REVISION_STATUS.PENDING_REVIEW), 2n),
    ]);

    await expect(service.batchSubmitReview([1n, 2n], '批量提交法规复核', actor)).rejects.toThrow(
      '仅草稿修订可提交复核：法规 2',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logs.appendWithClient).not.toHaveBeenCalled();
  });

  it('batch-approves pending revisions in one transaction and audits every regulation', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.PENDING_REVIEW, 1n), 1n),
      withId(record(REVISION_STATUS.PENDING_REVIEW, 3n), 2n),
    ]);
    const tx = { regulationRevision: { update: jest.fn().mockResolvedValue({}) } };
    logs.appendWithClient
      .mockResolvedValueOnce({ id: 'review-log-1' })
      .mockResolvedValueOnce({ id: 'review-log-2' });
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    const result = await service.batchReview([2n, 1n], '批量复核通过', {
      ...actor,
      adminId: 2n,
    });

    expect(result).toEqual({
      count: 2,
      ids: ['2', '1'],
      operation_log_ids: ['review-log-1', 'review-log-2'],
    });
    expect(tx.regulationRevision.update).toHaveBeenCalledTimes(2);
    expect(tx.regulationRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: REVISION_STATUS.APPROVED,
          reviewed_by: 2n,
          reviewed_at: expect.any(Date),
        }),
      }),
    );
    expect(logs.appendWithClient).toHaveBeenCalledTimes(2);
    expect(logs.appendWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'regulation.review.approve',
        afterSummary: expect.objectContaining({ batch_size: 2, reviewed_by: '2' }),
      }),
    );
  });

  it('rejects a mixed-state review batch before starting a transaction', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.PENDING_REVIEW, 1n), 1n),
      withId(record(REVISION_STATUS.DRAFT, 3n), 2n),
    ]);

    await expect(
      service.batchReview([1n, 2n], '批量复核通过', { ...actor, adminId: 2n }),
    ).rejects.toThrow('当前修订不在待复核状态：法规 2');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logs.appendWithClient).not.toHaveBeenCalled();
  });

  it('rejects a batch when the reviewer created any selected revision', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.PENDING_REVIEW, 1n), 1n),
      withId(record(REVISION_STATUS.PENDING_REVIEW, 2n), 2n),
    ]);

    await expect(
      service.batchReview([1n, 2n], '批量复核通过', { ...actor, adminId: 2n }),
    ).rejects.toThrow('录入人与复核人不能相同：法规 2');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logs.appendWithClient).not.toHaveBeenCalled();
  });

  it('batch-publishes approved revisions atomically and creates per-item audit logs', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.APPROVED), 1n),
      withId(record(REVISION_STATUS.APPROVED), 2n),
    ]);
    const tx = {
      regulationTagLink: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      regulationRegion: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn(),
      },
      regulationTag: { upsert: jest.fn().mockResolvedValue({ id: 100n }) },
      regulationRevision: { update: jest.fn().mockResolvedValue({}) },
      regulation: {
        update: jest.fn().mockResolvedValue({ status: REGULATION_STATUS.EFFECTIVE }),
      },
    };
    logs.appendWithClient
      .mockResolvedValueOnce({ id: 'publish-log-1' })
      .mockResolvedValueOnce({ id: 'publish-log-2' });
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    const result = await service.batchPublish([1n, 2n], '批量发布已复核法规', {
      ...actor,
      adminId: 9n,
    });

    expect(result.count).toBe(2);
    expect(result.ids).toEqual(['1', '2']);
    expect(tx.regulationRevision.update).toHaveBeenCalledTimes(2);
    expect(tx.regulation.update).toHaveBeenCalledTimes(2);
    expect(logs.appendWithClient).toHaveBeenCalledTimes(2);
    expect(logs.appendWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'regulation.publish',
        afterSummary: expect.objectContaining({ batch_size: 2 }),
      }),
    );
  });

  it('rejects an unreviewed entry before a batch publish transaction', async () => {
    prisma.regulation.findMany.mockResolvedValue([
      withId(record(REVISION_STATUS.APPROVED), 1n),
      withId(record(REVISION_STATUS.PENDING_REVIEW), 2n),
    ]);

    await expect(
      service.batchPublish([1n, 2n], '批量发布已复核法规', { ...actor, adminId: 9n }),
    ).rejects.toThrow('法规必须由另一名管理员复核通过后发布：法规 2');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
