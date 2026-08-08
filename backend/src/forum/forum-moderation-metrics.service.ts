import { Injectable } from '@nestjs/common';

@Injectable()
export class ForumModerationMetricsService {
  private counters = { attempts: 0, passed: 0, rejected: 0, failed: 0 };

  record(result: 'pass' | 'reject' | 'error'): void {
    this.counters.attempts += 1;
    if (result === 'pass') this.counters.passed += 1;
    if (result === 'reject') this.counters.rejected += 1;
    if (result === 'error') this.counters.failed += 1;
  }

  snapshot() {
    return { ...this.counters };
  }
}
