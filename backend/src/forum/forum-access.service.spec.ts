import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ForumAccessService } from './forum-access.service';

describe('ForumAccessService', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    userRestriction: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const flags = { isEnabled: jest.fn(), get: jest.fn() } as unknown as FeatureFlagService;
  const service = new ForumAccessService(prisma, flags);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 1n, forum_invited: true });
    (prisma.userRestriction.findFirst as jest.Mock).mockResolvedValue(null);
    (flags.isEnabled as jest.Mock).mockResolvedValue(true);
    (flags.get as jest.Mock).mockResolvedValue('invite_only');
  });

  it('keeps browsing but closes writes in read-only mode', async () => {
    (flags.isEnabled as jest.Mock).mockResolvedValue(false);
    await expect(service.capability(1n)).resolves.toMatchObject({
      can_write: false,
      reason: 'read_only',
    });
    await expect(service.assertCanPublish(1n)).rejects.toMatchObject({ status: 503 });
  });

  it('requires an explicit invitation in invite-only mode', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 1n, forum_invited: false });
    await expect(service.assertCanPublish(1n)).rejects.toMatchObject({ status: 403 });
  });

  it('blocks muted users with the end time and reason', async () => {
    (prisma.userRestriction.findFirst as jest.Mock).mockResolvedValue({
      ends_at: new Date('2030-01-01T00:00:00Z'),
      reason: '多次发布广告',
    });
    await expect(service.assertCanPublish(1n)).rejects.toMatchObject({ status: 423 });
  });
});
