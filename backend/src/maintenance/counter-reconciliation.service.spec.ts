import { CounterReconciliationService } from './counter-reconciliation.service';

describe('CounterReconciliationService', () => {
  it('repairs route derived counts without touching archived forum tables', async () => {
    const prisma = {
      route: {
        findMany: jest.fn().mockResolvedValue([{ id: 1n, favorite_count: 0 }]),
        update: jest.fn(),
      },
      routeFavorite: {
        groupBy: jest.fn().mockResolvedValue([{ route_id: 1n, _count: { _all: 2 } }]),
      },
    };
    const metrics = { increment: jest.fn() };
    const service = new CounterReconciliationService(prisma as never, metrics as never);
    await expect(service.reconcile()).resolves.toEqual({ routes: 1, total: 1 });
    expect(prisma.route.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { favorite_count: 2 },
    });
  });
});
