import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RouteCommentService } from './route-comment.service';

describe('RouteCommentService direct publishing', () => {
  const prisma = {
    route: { findFirst: jest.fn() },
    routeComment: { findUnique: jest.fn(), create: jest.fn() },
    fileRecord: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const flags = { assertEnabled: jest.fn() } as unknown as FeatureFlagService;
  const logs = {} as OperationLogService;
  const service = new RouteCommentService(prisma, flags, logs);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.route.findFirst as jest.Mock).mockResolvedValue({ id: 5n });
    (prisma.routeComment.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.routeComment.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 9n,
        content: data.content,
        images: data.images,
        report_count: 0,
        reported_at: null,
        status: data.status,
        moderation_status: data.moderation_status,
        rejection_reason: null,
        offline_reason: null,
        published_at: data.published_at,
        created_at: new Date('2026-08-12T00:00:00Z'),
        deleted_at: null,
        user: { id: 1n, nickname: '骑友', avatar_url: null },
      }),
    );
  });

  it('publishes a normal comment immediately', async () => {
    const result = await service.create(1n, 5n, '路线体验很好', [], 'comment-key-1');

    expect(result).toMatchObject({ status: 'PUBLISHED', replayed: false });
    expect(prisma.routeComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 1,
          moderation_status: 1,
          published_at: expect.any(Date),
        }),
      }),
    );
  });
});
