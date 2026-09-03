import { Prisma } from '@prisma/client';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminUserRouteService } from './admin-user-route.service';

describe('AdminUserRouteService', () => {
  const record = {
    id: 7n,
    user_id: 3n,
    title: '骑友测试路线',
    description: '路线说明',
    start_location: '起点',
    start_lat: new Prisma.Decimal(43.8),
    start_lng: new Prisma.Decimal(87.6),
    end_location: '终点',
    end_lat: new Prisma.Decimal(44.1),
    end_lng: new Prisma.Decimal(88.1),
    city_code: '650100',
    district_code: '650102',
    total_distance: 20,
    estimated_time: 60,
    difficulty: 2,
    images: [],
    visibility: 2,
    status: 1,
    view_count: 5,
    favorite_count: 2,
    external_route_url: null,
    polyline_provider: 'tencent-driving',
    offlined_at: null,
    offline_reason: null,
    offlined_by: null,
    created_at: new Date('2026-09-01T10:00:00Z'),
    updated_at: new Date('2026-09-01T10:00:00Z'),
    user: { id: 3n, nickname: '测试骑友', avatar_url: null, status: 1 },
    points: [],
    regions: [],
    ride_links: [],
    _count: { favorites: 2, comments: 1, ride_links: 0 },
  };
  const tx = {
    userRoute: { updateMany: jest.fn() },
    operationLog: { create: jest.fn() },
  };
  const prisma = {
    userRoute: { findUnique: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const operationLogs = {
    appendWithClient: jest.fn(),
  } as unknown as OperationLogService;
  const service = new AdminUserRouteService(prisma, operationLogs);
  const actor = { adminId: 9n, requestId: 'request-1', ipAddress: '127.0.0.1' };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.userRoute.findUnique as jest.Mock).mockResolvedValue(record);
    tx.userRoute.updateMany.mockResolvedValue({ count: 1 });
    (operationLogs.appendWithClient as jest.Mock).mockResolvedValue({ id: '1' });
  });

  it('records an audited admin offline operation', async () => {
    const offlined = { ...record, status: 2, offlined_at: new Date(), offline_reason: '内容违规' };
    (prisma.userRoute.findUnique as jest.Mock)
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(offlined);

    await expect(service.offline(7n, '内容违规', actor)).resolves.toMatchObject({
      id: '7',
      status: 2,
      offline_reason: '内容违规',
    });
    expect(tx.userRoute.updateMany).toHaveBeenCalledWith({
      where: { id: 7n, status: 1 },
      data: expect.objectContaining({
        status: 2,
        offline_reason: '内容违规',
        offlined_by: 9n,
      }),
    });
    expect(operationLogs.appendWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'user_route.offline', objectType: 'user_route' }),
    );
  });

  it('does not restore a route deleted by its user', async () => {
    (prisma.userRoute.findUnique as jest.Mock).mockResolvedValue({ ...record, status: 2 });
    await expect(service.restore(7n, '误操作恢复', actor)).rejects.toMatchObject({ status: 400 });
    expect(tx.userRoute.updateMany).not.toHaveBeenCalled();
  });
});
