import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AdminService } from './admin.service';

describe('AdminService audit integration', () => {
  const tx = { ride: { update: jest.fn() }, operationLog: { create: jest.fn() } };
  const prisma = {
    ride: { findFirst: jest.fn() },
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
});
