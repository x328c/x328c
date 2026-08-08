import { PrismaService } from '../prisma/prisma.service';
import { OperationLogService } from './operation-log.service';

describe('OperationLogService', () => {
  it('appends required audit fields and sanitizes summaries', async () => {
    const create = jest.fn().mockResolvedValue({ id: 7n, created_at: new Date('2026-07-31') });
    const prisma = { operationLog: { create } } as unknown as PrismaService;
    const service = new OperationLogService(prisma);

    await expect(
      service.append({
        adminId: 9n,
        action: 'user.ban',
        objectType: 'user',
        objectId: '42',
        reason: '违规处理',
        requestId: 'request-1234',
        ipAddress: '127.0.0.1',
        beforeSummary: { status: 1, phone: '13800138000', openid: 'openid-secret' },
        afterSummary: { status: 0, content: 'post full text' },
      }),
    ).resolves.toEqual({ id: '7', createdAt: new Date('2026-07-31') });

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      admin_id: 9n,
      action: 'user.ban',
      object_type: 'user',
      object_id: '42',
      reason: '违规处理',
      request_id: 'request-1234',
    });
    const serialized = JSON.stringify(data, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serialized).not.toContain('13800138000');
    expect(serialized).not.toContain('openid-secret');
    expect(serialized).not.toContain('post full text');
    expect(service).not.toHaveProperty('delete');
    expect(service).not.toHaveProperty('remove');
  });

  it('supports a minimal append and rejects incomplete records', async () => {
    const create = jest.fn().mockResolvedValue({ id: 8n, created_at: new Date('2026-07-31') });
    const service = new OperationLogService({
      operationLog: { create },
    } as unknown as PrismaService);

    await expect(
      service.append({
        adminId: 9n,
        action: 'route.publish',
        objectType: 'route',
        objectId: '88',
        reason: '内容复核通过',
        requestId: 'request-5678',
      }),
    ).resolves.toMatchObject({ id: '8' });
    expect(create.mock.calls[0][0].data).toMatchObject({
      before_summary: undefined,
      after_summary: undefined,
      ip_address: undefined,
    });

    await expect(
      service.append({
        adminId: 9n,
        action: '',
        objectType: 'route',
        objectId: '88',
        reason: 'invalid',
        requestId: 'request-5678',
      }),
    ).rejects.toThrow('Operation log fields are incomplete');
  });
});
