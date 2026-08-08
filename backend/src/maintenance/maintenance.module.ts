import { Global, Module } from '@nestjs/common';
import { CounterReconciliationScheduler } from './counter-reconciliation.scheduler';
import { CounterReconciliationService } from './counter-reconciliation.service';

@Global()
@Module({
  providers: [CounterReconciliationService, CounterReconciliationScheduler],
  exports: [CounterReconciliationService],
})
export class MaintenanceModule {}
