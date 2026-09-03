import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  it('stores region events without user identity or private POI data', async () => {
    const prisma = { analyticsEvent: { create: jest.fn().mockResolvedValue({}) } };
    const service = new TelemetryService(prisma as never, { consume: jest.fn() } as never);
    await service.track({
      event_id: 'region-123456789012', name: 'poi_choose_success',
      properties: { business: 'ride', type: 2, has_city: false, address: 'private', latitude: 43.8 },
      occurred_at: '2026-09-03T00:00:00.000Z',
    }, 4n, 'test');
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({ data: {
      event_id: 'region-123456789012', name: 'poi_choose_success', user_id: undefined,
      properties: { business: 'ride', type: 2, has_city: false }, occurred_at: new Date('2026-09-03T00:00:00.000Z'),
    } });
  });
  it('stores an allowlisted event and treats duplicate event ids as idempotent', async () => {
    const prisma = { analyticsEvent: { create: jest.fn().mockResolvedValue({}) } };
    const rateLimit = { consume: jest.fn().mockResolvedValue({ allowed: true }) };
    const service = new TelemetryService(prisma as never, rateLimit as never);
    await expect(
      service.track(
        {
          event_id: 'event-123456789012',
          name: 'route_detail_view',
          properties: { route_id: '7', visible: true },
          occurred_at: '2026-08-01T00:00:00.000Z',
        },
        4n,
        '127.0.0.1:test',
      ),
    ).resolves.toEqual({ accepted: true, duplicate: false });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ user_id: 4n, name: 'route_detail_view' }),
      }),
    );
    prisma.analyticsEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      service.track(
        {
          event_id: 'event-123456789013',
          name: 'route_detail_view',
          properties: {},
          occurred_at: '2026-08-01T00:00:00.000Z',
        },
        undefined,
        '127.0.0.1:test',
      ),
    ).resolves.toEqual({ accepted: true, duplicate: true });
  });
});
