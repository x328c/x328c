import { AdminRegulationService } from './admin-regulation.service';

describe('AdminRegulationService permanent deletion', () => {
  const actor = { adminId: 9n, requestId: 'delete-test', ipAddress: '127.0.0.1' };

  it('deletes dependent records and writes one audit entry in the same transaction', async () => {
    const tx = {
      regulation: {
        findMany: jest.fn().mockResolvedValue([{ id: 1n, title: '旧法规', document_no: '文号', current_revision_id: 10n }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      regulationImportRow: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      regulationFeedback: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      regulationTag: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const logs = { appendWithClient: jest.fn().mockResolvedValue({ id: 'log-1' }) };
    const service = new AdminRegulationService(prisma as never, logs as never);

    await expect(service.permanentlyDelete([1n], '不属于摩托车法规', actor)).resolves.toEqual({ count: 1, ids: ['1'], operation_log_id: 'log-1' });
    expect(tx.regulationImportRow.updateMany).toHaveBeenCalled();
    expect(tx.regulationFeedback.deleteMany).toHaveBeenCalled();
    expect(tx.regulation.deleteMany).toHaveBeenCalled();
    expect(logs.appendWithClient).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'regulation.delete', reason: '不属于摩托车法规' }));
  });

  it('fails the whole batch when any ID is missing', async () => {
    const tx = {
      regulation: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
      regulationImportRow: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new AdminRegulationService(prisma as never, { appendWithClient: jest.fn() } as never);
    await expect(service.permanentlyDelete([1n, 2n], '批量清理', actor)).rejects.toThrow('法规删除目标不存在');
    expect(tx.regulationImportRow.updateMany).not.toHaveBeenCalled();
  });
});
