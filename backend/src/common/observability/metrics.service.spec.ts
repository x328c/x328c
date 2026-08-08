import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('records API errors and p95 latency', () => {
    const service = new MetricsService();
    service.recordHttp('GET /api/v1/routes', 200, 10);
    service.recordHttp('GET /api/v1/routes', 503, 50);
    expect(service.snapshot().api).toEqual([
      expect.objectContaining({
        route: 'GET /api/v1/routes',
        requests: 2,
        errors: 1,
        error_rate: 0.5,
        p95_ms: 50,
      }),
    ]);
  });
});
