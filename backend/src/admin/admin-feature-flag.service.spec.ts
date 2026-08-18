import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminFeatureFlagController } from './admin-feature-flag.controller';
import { AdminFeatureFlagService, MANAGED_FEATURE_FLAG_KEYS } from './admin-feature-flag.service';

describe('AdminFeatureFlagService', () => {
  const tx = {
    featureFlag: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const flags = {
    get: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as FeatureFlagService;
  const operationLogs = {
    appendWithClient: jest.fn(),
  } as unknown as OperationLogService;
  const service = new AdminFeatureFlagService(prisma, flags, operationLogs);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.featureFlag.findMany.mockResolvedValue([]);
    tx.featureFlag.upsert.mockResolvedValue({});
    (flags.invalidate as jest.Mock).mockResolvedValue(undefined);
    (operationLogs.appendWithClient as jest.Mock).mockResolvedValue({ id: '1' });
  });

  it('returns all managed flags using the fail-closed feature flag service', async () => {
    (flags.get as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'route.enabled' || key === 'regulation.enabled' ? true : false,
      ),
    );

    await expect(service.getAll()).resolves.toEqual({
      route_enabled: true,
      regulation_enabled: true,
      route_link_enabled: false,
      route_comment_enabled: false,
      route_comment_read_enabled: false,
      safety_guide_enabled: false,
      safety_agreement_enforced: false,
    });
  });

  it('updates all values in one transaction, appends audit and invalidates every cache key', async () => {
    (flags.get as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        !['safety_guide.enabled', 'safety_agreement.enforced'].includes(key),
      ),
    );

    const result = await service.update(
      {
        route_enabled: true,
        regulation_enabled: true,
        route_link_enabled: true,
        route_comment_enabled: true,
        route_comment_read_enabled: true,
        safety_guide_enabled: false,
        safety_agreement_enforced: false,
        reason: '本地完整功能联调',
      },
      { adminId: 9n, requestId: 'request-1', ipAddress: '127.0.0.1' },
    );

    expect(tx.featureFlag.upsert).toHaveBeenCalledTimes(MANAGED_FEATURE_FLAG_KEYS.length);
    expect(operationLogs.appendWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'feature_flags.update',
        objectType: 'feature_flags',
        objectId: 'v2.2',
        reason: '本地完整功能联调',
      }),
    );
    expect(flags.invalidate).toHaveBeenCalledWith(MANAGED_FEATURE_FLAG_KEYS);
    expect(result).toEqual({
      route_enabled: true,
      regulation_enabled: true,
      route_link_enabled: true,
      route_comment_enabled: true,
      route_comment_read_enabled: true,
      safety_guide_enabled: false,
      safety_agreement_enforced: false,
    });
  });

  it('limits updates to super administrators', () => {
    const method = AdminFeatureFlagController.prototype.update;
    expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([9]);
  });
});
