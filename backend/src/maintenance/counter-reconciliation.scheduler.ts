import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../common/redis/redis.service';
import { TaskFailureService } from '../common/task-failure/task-failure.service';
import { CounterReconciliationService } from './counter-reconciliation.service';

@Injectable()
export class CounterReconciliationScheduler {
  private readonly logger = new Logger(CounterReconciliationScheduler.name);

  constructor(
    private readonly counters: CounterReconciliationService,
    private readonly redis: RedisService,
    private readonly failures: TaskFailureService,
  ) {}

  @Cron('17 */15 * * * *')
  async run(): Promise<void> {
    const result = await this.redis.withLock('v2:lock:counter-reconciliation', 600, async () => {
      try {
        const summary = await this.counters.reconcile();
        if (summary.total)
          this.logger.warn(`Counter reconciliation corrected ${summary.total} records`);
        return summary;
      } catch (error) {
        await this.failures.record(
          'counter.reconciliation',
          `counter-reconciliation:${new Date().toISOString().slice(0, 13)}`,
          'counter_reconciliation_failed',
          error instanceof Error ? error.message : 'counter reconciliation failed',
        );
        throw error;
      }
    });
    if (result === null)
      this.logger.debug('Counter reconciliation skipped because another instance holds the lock');
  }
}
