import { Injectable } from '@nestjs/common';

type HttpMetric = { count: number; errors: number; durations: number[] };

@Injectable()
export class MetricsService {
  private readonly http = new Map<string, HttpMetric>();
  private readonly counters = new Map<string, number>();

  recordHttp(route: string, statusCode: number, durationMs: number): void {
    const metric = this.http.get(route) ?? { count: 0, errors: 0, durations: [] };
    metric.count += 1;
    if (statusCode >= 400) metric.errors += 1;
    metric.durations.push(Math.max(0, Math.round(durationMs)));
    if (metric.durations.length > 500) metric.durations.shift();
    this.http.set(route, metric);
  }

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  snapshot() {
    const api = [...this.http.entries()].map(([route, metric]) => {
      const durations = [...metric.durations].sort((left, right) => left - right);
      const index = durations.length
        ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)
        : 0;
      return {
        route,
        requests: metric.count,
        errors: metric.errors,
        error_rate: metric.count ? metric.errors / metric.count : 0,
        p95_ms: durations[index] ?? 0,
      };
    });
    return { api, counters: Object.fromEntries(this.counters.entries()) };
  }
}
