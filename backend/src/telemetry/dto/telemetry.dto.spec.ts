import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TrackTelemetryEventDto } from './telemetry.dto';

describe('TrackTelemetryEventDto', () => {
  const payload = {
    event_id: 'event-123456789012',
    properties: {},
    occurred_at: '2026-08-13T00:00:00.000Z',
  };

  it.each(['safety_guide_accident_open', 'safety_guide_source_click'])(
    'accepts the safety guide event %s',
    async (name) => {
      const dto = plainToInstance(TrackTelemetryEventDto, { ...payload, name });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('still rejects an unknown event name', async () => {
    const dto = plainToInstance(TrackTelemetryEventDto, { ...payload, name: 'unknown_event' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });
});
