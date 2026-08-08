import { CounterReconciliationService } from './counter-reconciliation.service';

describe('CounterReconciliationService', () => {
  it('repairs route and forum derived counts from fact tables', async () => {
    const prisma = {
      route: {
        findMany: jest.fn().mockResolvedValue([{ id: 1n, favorite_count: 0 }]),
        update: jest.fn(),
      },
      routeFavorite: {
        groupBy: jest.fn().mockResolvedValue([{ route_id: 1n, _count: { _all: 2 } }]),
      },
      forumPost: {
        findMany: jest.fn().mockResolvedValue([{ id: 2n, like_count: 0, reply_count: 0 }]),
        update: jest.fn(),
      },
      forumLike: { groupBy: jest.fn().mockResolvedValue([{ target_id: 2n, _count: { _all: 1 } }]) },
      forumReply: { groupBy: jest.fn().mockResolvedValue([{ post_id: 2n, _count: { _all: 3 } }]) },
    };
    const metrics = { increment: jest.fn() };
    const service = new CounterReconciliationService(prisma as never, metrics as never);
    await expect(service.reconcile()).resolves.toEqual({ routes: 1, forumPosts: 1, total: 2 });
    expect(prisma.route.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { favorite_count: 2 },
    });
    expect(prisma.forumPost.update).toHaveBeenCalledWith({
      where: { id: 2n },
      data: { like_count: 1, reply_count: 3 },
    });
  });
});
