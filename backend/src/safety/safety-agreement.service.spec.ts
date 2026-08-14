import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SafetyAgreementService } from './safety-agreement.service';

describe('SafetyAgreementService', () => {
  const agreement = {
    id: 12n,
    code: 'ride_safety',
    version: '2026.08.1',
    title: '安全须知与风险提示',
    content: 'content',
    content_hash: 'a'.repeat(64),
    scene: 'ride_join',
    status: 1,
    effective_at: new Date('2026-08-01T00:00:00Z'),
    expires_at: null,
    created_by: 1n,
    reviewed_by: 2n,
    reviewed_at: new Date(),
    last_legal_reviewed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };
  const prisma = { safetyAgreement: { findFirst: jest.fn() } } as unknown as PrismaService;
  const flags = { isEnabled: jest.fn() } as unknown as FeatureFlagService;
  const logs = {} as OperationLogService;
  const service = new SafetyAgreementService(prisma, flags, logs);
  const tx = {
    safetyAgreement: { findFirst: jest.fn() },
    safetyAgreementAcceptance: { create: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (tx.safetyAgreementAcceptance.create as jest.Mock).mockResolvedValue({ id: 1n });
  });

  it('keeps legacy clients compatible while enforcement is disabled', async () => {
    (flags.isEnabled as jest.Mock).mockResolvedValue(false);
    await expect(
      service.verifyAndRecord(tx as never, {
        userId: 1n,
        scene: 'ride_join',
        targetType: 'ride',
        targetId: 9n,
        requestId: 'r1',
      }),
    ).resolves.toBeNull();
    expect(tx.safetyAgreement.findFirst).not.toHaveBeenCalled();
  });

  it('rejects missing proof when enforcement is enabled', async () => {
    (flags.isEnabled as jest.Mock).mockResolvedValue(true);
    await expect(
      service.verifyAndRecord(tx as never, {
        userId: 1n,
        scene: 'ride_join',
        targetType: 'ride',
        targetId: 9n,
        requestId: 'r1',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('records the server-selected agreement and content hash', async () => {
    (flags.isEnabled as jest.Mock).mockResolvedValue(true);
    (tx.safetyAgreement.findFirst as jest.Mock).mockResolvedValue(agreement);
    await service.verifyAndRecord(tx as never, {
      userId: 1n,
      scene: 'ride_join',
      targetType: 'ride',
      targetId: 9n,
      requestId: 'r1',
      idempotencyKey: 'key-1',
      proof: { id: '12', version: '2026.08.1', content_hash: `sha256:${'a'.repeat(64)}` },
    });
    expect(tx.safetyAgreementAcceptance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agreement_id: 12n,
        scene: 'ride_join',
        target_id: 9n,
        content_hash: 'a'.repeat(64),
      }),
    });
  });

  it('rejects a stale or forged version', async () => {
    (flags.isEnabled as jest.Mock).mockResolvedValue(true);
    (tx.safetyAgreement.findFirst as jest.Mock).mockResolvedValue(agreement);
    await expect(
      service.verifyAndRecord(tx as never, {
        userId: 1n,
        scene: 'ride_join',
        targetType: 'ride',
        targetId: 9n,
        requestId: 'r1',
        idempotencyKey: 'key-1',
        proof: { id: '12', version: 'old', content_hash: `sha256:${'a'.repeat(64)}` },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.safetyAgreementAcceptance.create).not.toHaveBeenCalled();
  });
});
