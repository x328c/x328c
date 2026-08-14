import { PrismaService } from '../common/prisma/prisma.service';
import { UserRouteService } from './user-route.service';

describe('UserRouteService visibility and publishing', () => {
  const prisma = {
    userRoute: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    fileRecord: { count: jest.fn() },
  } as unknown as PrismaService;
  const service = new UserRouteService(prisma);
  const record = {
    id: 7n,
    user_id: 1n,
    title: '公开路线',
    description: null,
    start_location: '公共停车场',
    start_lat: 30,
    start_lng: 120,
    end_location: null,
    end_lat: null,
    end_lng: null,
    waypoints: [],
    images: [],
    visibility: 2,
    view_count: 3,
    favorite_count: 0,
    status: 1,
    user: { id: 1n, nickname: '骑友', avatar_url: null },
  };

  beforeEach(() => jest.clearAllMocks());

  it('does not disclose a private route to another user', async () => {
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue({ ...record, visibility: 1 });
    await expect(service.detail(7n, 2n)).rejects.toMatchObject({ status: 404 });
    expect(prisma.userRoute.update).not.toHaveBeenCalled();
  });

  it('increments public views for a non-owner but not for the owner', async () => {
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue({ ...record });
    (prisma.userRoute.update as jest.Mock).mockResolvedValue(undefined);
    await expect(service.detail(7n, 2n)).resolves.toMatchObject({ view_count: 4 });
    expect(prisma.userRoute.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { view_count: { increment: 1 } },
    });

    jest.clearAllMocks();
    (prisma.userRoute.findFirst as jest.Mock).mockResolvedValue({ ...record });
    await service.detail(7n, 1n);
    expect(prisma.userRoute.update).not.toHaveBeenCalled();
  });

  it('validates image ownership before publishing a public route', async () => {
    (prisma.fileRecord.count as jest.Mock).mockResolvedValue(1);
    (prisma.userRoute.create as jest.Mock).mockResolvedValue({
      ...record,
      images: ['https://cdn.example.com/a.jpg'],
    });
    await service.create(1n, {
      title: '公开路线',
      start_location: '公共停车场',
      start_lat: 30,
      start_lng: 120,
      images: ['https://cdn.example.com/a.jpg'],
      visibility: 2,
    });
    expect(prisma.fileRecord.count).toHaveBeenCalledWith({
      where: {
        user_id: 1n,
        cdn_url: { in: ['https://cdn.example.com/a.jpg'] },
        file_key: { startsWith: 'user-routes/' },
      },
    });
  });
});
