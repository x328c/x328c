import { TaskFailureService } from './task-failure.service';

describe('TaskFailureService', () => {
  it('records failures idempotently by fingerprint and exposes compensation state', async () => {
    const prisma = {
      taskFailure: { upsert: jest.fn().mockResolvedValue({ id: 4n, attempts: 2 }) },
    };
    const logger = { warn: jest.fn() };
    const metrics = { increment: jest.fn() };
    const service = new TaskFailureService(prisma as never, logger as never, metrics as never);
    await expect(
      service.record('counter.reconcile', 'route:1', 'db_error', 'temporary'),
    ).resolves.toEqual({ id: 4n, attempts: 2 });
    expect(prisma.taskFailure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fingerprint: 'route:1' } }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'background_task_failed', task_key: 'counter.reconcile' }),
    );
  });
});
