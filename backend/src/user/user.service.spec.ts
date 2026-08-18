import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { UserService } from './user.service';

describe('UserService account closure', () => {
  const tx = {
    user: { update: jest.fn() },
    userProfile: { updateMany: jest.fn() },
    userSetting: { deleteMany: jest.fn() },
    routeComment: { updateMany: jest.fn() },
    forumPost: { updateMany: jest.fn() },
    forumReply: { updateMany: jest.fn() },
    activityRegistration: { updateMany: jest.fn() },
    appFeedback: { updateMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
  };
  const prisma = {
    user: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const redis = { geoRemove: jest.fn() } as unknown as RedisService;
  const service = new UserService(prisma, redis);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 7n,
      status: 1,
      profile: { city_code: '650100' },
    });
    (redis.geoRemove as jest.Mock).mockResolvedValue(1);
  });

  it('anonymizes account identifiers and removes optional personal content in one transaction', async () => {
    await expect(service.closeAccount(7n, true)).resolves.toEqual({ success: true });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: expect.objectContaining({
        openid: expect.stringMatching(/^deleted:7:/),
        unionid: null,
        nickname: '已注销用户',
        avatar_url: null,
        phone: null,
        status: 0,
        deleted_at: expect.any(Date),
      }),
    });
    expect(tx.userProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 7n } }),
    );
    expect(tx.routeComment.updateMany).toHaveBeenCalled();
    expect(tx.forumPost.updateMany).toHaveBeenCalled();
    expect(tx.activityRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: null, emergency_contact: null }),
      }),
    );
    expect(redis.geoRemove).toHaveBeenCalledWith('geo:users:650100', '7');
  });
});

describe('UserService contact visibility', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    userSetting: { findUnique: jest.fn() },
    ride: { findFirst: jest.fn() },
    activity: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const service = new UserService(prisma, {} as RedisService);

  beforeEach(() => jest.clearAllMocks());

  it('returns a public WeChat ID to a ride-detail viewer', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 9n,
      status: 1,
      profile: { wechat_id: 'public-contact', wechat_visible: 2 },
    });
    await expect(service.getVisibleWechat(undefined, 9n)).resolves.toBe('public-contact');
    expect(prisma.userSetting.findUnique).not.toHaveBeenCalled();
  });

  it('does not return a hidden WeChat ID', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 9n,
      status: 1,
      profile: { wechat_id: 'hidden-contact', wechat_visible: 0 },
    });
    (prisma.userSetting.findUnique as jest.Mock).mockResolvedValue({ contact_visible: false });
    await expect(service.getVisibleWechat(7n, 9n)).resolves.toBeNull();
  });
});
