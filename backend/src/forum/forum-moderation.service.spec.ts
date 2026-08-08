import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ForumModerationGateway } from './forum-moderation.gateway';
import { ForumModerationMetricsService } from './forum-moderation-metrics.service';
import { ForumModerationService } from './forum-moderation.service';

describe('ForumModerationService', () => {
  const prisma = {
    forumPost: { findFirst: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    forumPostImage: { updateMany: jest.fn() },
    forumReply: { findFirst: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const gateway = {
    checkText: jest.fn(),
    checkImage: jest.fn(),
  } as unknown as ForumModerationGateway;
  const flags = { isEnabled: jest.fn() } as unknown as FeatureFlagService;
  let metrics: ForumModerationMetricsService;
  let service: ForumModerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    metrics = new ForumModerationMetricsService();
    service = new ForumModerationService(prisma, gateway, metrics, flags);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(prisma));
    (prisma.forumPost.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.forumReply.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('keeps provider failures pending and routes them to manual review', async () => {
    (prisma.forumPost.findFirst as jest.Mock).mockResolvedValue({
      id: 8n,
      title: '安全经验',
      content: '正文内容',
      status: 1,
      moderation_status: 0,
      moderation_attempts: 0,
      moderation_version: 1,
      images: [],
    });
    (gateway.checkText as jest.Mock).mockResolvedValue({
      decision: 'error',
      code: 'moderation_timeout',
    });
    await expect(service.moderatePost(8n)).resolves.toBe('error');
    expect(prisma.forumPost.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderation_status: 0,
          published_at: null,
          manual_review_required: true,
          moderation_last_error_code: 'moderation_timeout',
        }),
      }),
    );
    expect(metrics.snapshot()).toEqual({ attempts: 1, passed: 0, rejected: 0, failed: 1 });
  });

  it('publishes only after text and every image pass', async () => {
    (prisma.forumPost.findFirst as jest.Mock).mockResolvedValue({
      id: 9n,
      title: '装备经验',
      content: '正文内容',
      status: 1,
      moderation_status: 0,
      moderation_attempts: 0,
      moderation_version: 1,
      images: [
        { id: 2n, moderation_attempts: 0, file_record: { file_url: 'https://cdn.example/a.jpg' } },
      ],
    });
    (gateway.checkText as jest.Mock).mockResolvedValue({ decision: 'pass' });
    (gateway.checkImage as jest.Mock).mockResolvedValue({ decision: 'pass' });
    (prisma.forumPostImage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    await expect(service.moderatePost(9n)).resolves.toBe('pass');
    expect(prisma.forumPost.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderation_status: 1,
          manual_review_required: false,
          published_at: expect.any(Date),
        }),
      }),
    );
  });

  it('stops automatic retry scheduling after the third failed attempt', async () => {
    (prisma.forumPost.findFirst as jest.Mock).mockResolvedValue({
      id: 10n,
      title: '故障积压测试',
      content: '审核服务连续故障时保持待审。',
      status: 1,
      moderation_status: 0,
      moderation_attempts: 2,
      moderation_version: 1,
      images: [],
    });
    (gateway.checkText as jest.Mock).mockResolvedValue({
      decision: 'error',
      code: 'provider_unavailable',
    });
    await service.moderatePost(10n);
    expect(prisma.forumPost.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderation_status: 0,
          moderation_next_retry_at: null,
          manual_review_required: true,
        }),
      }),
    );
  });

  it('uses a conditional claim so duplicate retries do not invoke the provider twice', async () => {
    (prisma.forumPost.findFirst as jest.Mock).mockResolvedValue({
      id: 11n,
      title: '重试幂等测试',
      content: '相同版本只允许一个审核尝试取得执行权。',
      status: 1,
      moderation_status: 0,
      moderation_attempts: 1,
      moderation_version: 1,
      images: [],
    });
    (prisma.forumPost.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    await expect(service.moderatePost(11n)).resolves.toBe('skipped');
    expect(gateway.checkText).not.toHaveBeenCalled();
  });

  it('does not run scheduled retries while forum writes are safely closed', async () => {
    (flags.isEnabled as jest.Mock).mockResolvedValue(false);
    await expect(service.retryDue()).resolves.toEqual({ posts: 0, replies: 0 });
    expect(prisma.forumPost.findMany).not.toHaveBeenCalled();
  });
});
