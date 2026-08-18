import { Injectable } from '@nestjs/common';
import { MetricsService } from '../common/observability/metrics.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CounterReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async reconcile(): Promise<{ routes: number; total: number }> {
    const [routes, routeCounts] = await Promise.all([
      this.prisma.route.findMany({
        where: { deleted_at: null },
        select: { id: true, favorite_count: true },
      }),
      this.prisma.routeFavorite.groupBy({ by: ['route_id'], _count: { _all: true } }),
    ]);
    const routeMap = new Map(routeCounts.map((row) => [row.route_id.toString(), row._count._all]));
    let routeMismatches = 0;
    for (const route of routes) {
      const count = routeMap.get(route.id.toString()) ?? 0;
      if (route.favorite_count !== count) {
        await this.prisma.route.update({
          where: { id: route.id },
          data: { favorite_count: count },
        });
        routeMismatches += 1;
      }
    }
    const total = routeMismatches;
    this.metrics.increment('counter.reconciliation.runs');
    if (total) this.metrics.increment('counter.reconciliation.mismatches', total);
    return { routes: routeMismatches, total };
  }
}
