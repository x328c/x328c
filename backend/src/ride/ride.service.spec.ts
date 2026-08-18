import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RideService } from './ride.service';

describe('RideService creator transfer', () => {
  const tx = {
    ride: { findFirst: jest.fn(), update: jest.fn() },
    rideParticipant: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const service = new RideService(prisma, {} as never, {} as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.ride.findFirst.mockResolvedValue({
      id: 11n,
      user_id: 1n,
      title: '周末同行',
      status: 1,
      departure_time: new Date(Date.now() + 86_400_000),
      deleted_at: null,
    });
    tx.rideParticipant.findUnique.mockResolvedValue({
      id: 22n,
      user_id: 2n,
      status: 1,
      deleted_at: null,
      user: { nickname: '新发起人' },
    });
  });

  it('atomically transfers ownership to an active participant', async () => {
    await expect(service.transferCreator(1n, 11n, 2n)).resolves.toEqual({
      success: true,
      creator_id: '2',
      creator_name: '新发起人',
    });
    expect(tx.rideParticipant.updateMany).toHaveBeenCalledWith({
      where: { ride_id: 11n, is_creator: true },
      data: { is_creator: false },
    });
    expect(tx.rideParticipant.update).toHaveBeenCalledWith({
      where: { id: 22n },
      data: { is_creator: true },
    });
    expect(tx.ride.update).toHaveBeenCalledWith({ where: { id: 11n }, data: { user_id: 2n } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});
