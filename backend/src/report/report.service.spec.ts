import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateLimitService } from '../common/resilience/rate-limit.service';
import { ReportService } from './report.service';

describe('ReportService route-comment reports', () => {
  const transactionReportCreate = jest.fn();
  const transactionCommentUpdate = jest.fn();
  const transaction = {
    report: { create: transactionReportCreate },
    routeComment: { update: transactionCommentUpdate },
  };
  const prisma = {
    routeComment: { findFirst: jest.fn() },
    report: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  } as unknown as PrismaService;
  const logs = {} as OperationLogService;
  const rateLimits = { consume: jest.fn() } as unknown as RateLimitService;
  const service = new ReportService(prisma, logs, rateLimits);

  const comment = {
    id: 10n,
    route_id: 20n,
    user_id: 30n,
    content: '路线体验很好',
    status: 1,
    report_count: 2,
    moderation_status: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.routeComment.findFirst as jest.Mock).mockResolvedValue(comment);
    (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
    transactionReportCreate.mockResolvedValue({ id: 99n, status: 0 });
    transactionCommentUpdate.mockResolvedValue({});
  });

  it('increments the counter without changing comment visibility', async () => {
    await expect(
      service.create(40n, '127.0.0.1', {
        content_type: 'route_comment',
        content_id: '10',
        reason: 1,
        source: 'route',
      }),
    ).resolves.toMatchObject({ id: '99', replayed: false });

    expect(transactionCommentUpdate).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { report_count: { increment: 1 }, reported_at: expect.any(Date) },
    });
    expect(transactionCommentUpdate).toHaveBeenCalledTimes(1);
  });

  it('replays a duplicate reporter-comment pair without incrementing again', async () => {
    (prisma.report.findUnique as jest.Mock).mockResolvedValue({ id: 88n, status: 0 });

    await expect(
      service.create(40n, '127.0.0.1', {
        content_type: 'route_comment',
        content_id: '10',
        reason: 1,
        source: 'route',
      }),
    ).resolves.toMatchObject({ id: '88', replayed: true });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transactionCommentUpdate).not.toHaveBeenCalled();
  });
});
