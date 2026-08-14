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
