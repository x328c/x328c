import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { TelemetryService } from '../src/telemetry/telemetry.service';
import { assertIsolatedTestDatabaseUrl } from './database-safety';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('region telemetry on isolated MySQL', () => {
  let prisma: PrismaClient;
  const eventId = `region-${randomUUID()}`;
  beforeAll(async () => {
    const url = assertIsolatedTestDatabaseUrl(databaseUrl).toString();
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
  });
  afterAll(async () => {
    try {
      if (prisma) await prisma.analyticsEvent.deleteMany({ where: { event_id: eventId } });
    } finally {
      await prisma?.$disconnect();
    }
  });
  it('persists only approved properties, omits user FK and deduplicates the event', async () => {
    const service = new TelemetryService(prisma as never, { consume: jest.fn() } as never);
    const dto = {
      event_id: eventId, name: 'poi_region_manual_confirm' as const,
      properties: {
        business: 'ride', city_code: '652300', previous_city_code: '650100',
        changed: true, district_selected: false, catalog_version: '2025-12-31',
        address: 'synthetic-private-address', latitude: 43.8, error: 'synthetic-private-error',
      },
      occurred_at: new Date().toISOString(),
    };
    // Deliberately nonexistent user: the region event must not persist this FK.
    expect(await service.track(dto, 9223372036854775806n, 'isolated-test')).toEqual({ accepted: true, duplicate: false });
    expect(await service.track(dto, undefined, 'isolated-test')).toEqual({ accepted: true, duplicate: true });
    const saved = await prisma.analyticsEvent.findUniqueOrThrow({ where: { event_id: eventId } });
    expect(saved.user_id).toBeNull();
    expect(saved.properties).toEqual({
      business: 'ride', city_code: '652300', previous_city_code: '650100',
      changed: true, district_selected: false, catalog_version: '2025-12-31',
    });
  });
});
