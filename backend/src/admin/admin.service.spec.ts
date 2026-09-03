import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AdminService } from './admin.service';

describe('AdminService audit integration', () => {
  const tx = { ride: { update: jest.fn() }, operationLog: { create: jest.fn() } };
  const prisma = {
    ride: { findFirst: jest.fn(), count: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  } as unknown as PrismaService;
  const redis = { geoRemove: jest.fn() } as unknown as RedisService;
  const operationLogs = { appendWithClient: jest.fn() } as unknown as OperationLogService;
  const service = new AdminService(
    prisma,
    {} as JwtService,
    {} as ConfigService,
    redis,
    operationLogs,
  );
  const audit = { adminId: 9n, requestId: 'request-1234', ipAddress: '127.0.0.1' };

  beforeEach(() => jest.clearAllMocks());

  it('writes ride mutation and operation log through the same transaction client', async () => {
    (prisma.ride.findFirst as jest.Mock).mockResolvedValue({
      id: 1n,
      city_code: '650100',
      status: 1,
      audit_status: 1,
    });
    (operationLogs.appendWithClient as jest.Mock).mockResolvedValue({ id: '1' });
    (redis.geoRemove as jest.Mock).mockResolvedValue(1);

    await expect(service.offlineRide(1n, audit)).resolves.toEqual({ success: true });

    expect(tx.ride.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { status: 5, audit_status: 2 },
    });
    expect(operationLogs.appendWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        adminId: 9n,
        action: 'ride.offline',
        objectType: 'ride',
        objectId: '1',
        requestId: 'request-1234',
      }),
    );
  });

  it('does not continue to cache invalidation when mandatory audit writing fails', async () => {
    (prisma.ride.findFirst as jest.Mock).mockResolvedValue({
      id: 1n,
      city_code: '650100',
      status: 1,
      audit_status: 1,
    });
    (operationLogs.appendWithClient as jest.Mock).mockRejectedValue(new Error('audit unavailable'));

    await expect(service.offlineRide(1n, audit)).rejects.toThrow('audit unavailable');
    expect(redis.geoRemove).not.toHaveBeenCalled();
  });

  it('returns a JSON-serializable user detail without Prisma BigInt profile identifiers', async () => {
    const createdAt = new Date('2026-09-02T00:00:00.000Z');
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 4n,
      openid: 'openid-4',
      unionid: null,
      nickname: '测试骑友',
      avatar_url: null,
      gender: 0,
      phone: null,
      status: 1,
      role: 0,
      last_login_at: createdAt,
      profile: {
        id: 9n,
        user_id: 4n,
        motorcycle_model: 'adv',
        riding_years: 3,
        riding_styles: ['touring'],
        province: '新疆维吾尔自治区',
        city: '乌鲁木齐市',
        district: null,
        city_code: '650100',
        location_lat: { toString: () => '43.8256000' },
        location_lng: { toString: () => '87.6168000' },
        location_offset_seed: null,
        location_visible: 2,
        bio: null,
        wechat_id: 'wx-test',
        wechat_id_normalized: 'wx-test',
        wechat_visible: 1,
        created_at: createdAt,
        updated_at: createdAt,
        deleted_at: null,
      },
    });
    (prisma.ride.count as jest.Mock).mockResolvedValue(2);

    const detail = await service.userDetail(4n);

    expect(() => JSON.stringify(detail)).not.toThrow();
    expect(detail).toEqual(
      expect.objectContaining({
        id: '4',
        profile: expect.objectContaining({
          motorcycle_model: 'adv',
          location_lat: '43.8256000',
          location_lng: '87.6168000',
        }),
        statistics: { ride_count: 2 },
      }),
    );
    expect(detail.profile).not.toHaveProperty('id');
    expect(detail.profile).not.toHaveProperty('user_id');
  });
});
