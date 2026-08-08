import { Injectable } from '@nestjs/common';
import { MetricsService } from '../common/observability/metrics.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CounterReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async reconcile(): Promise<{ routes: number; forumPosts: number; total: number }> {
    const [routes, routeCounts, posts, likeCounts, replyCounts] = await Promise.all([
      this.prisma.route.findMany({
        where: { deleted_at: null },
        select: { id: true, favorite_count: true },
      }),
      this.prisma.routeFavorite.groupBy({ by: ['route_id'], _count: { _all: true } }),
      this.prisma.forumPost.findMany({
        where: { deleted_at: null },
        select: { id: true, like_count: true, reply_count: true },
      }),
      this.prisma.forumLike.groupBy({
        where: { target_type: 'post' },
        by: ['target_id'],
        _count: { _all: true },
      }),
      this.prisma.forumReply.groupBy({
        where: { status: 1, moderation_status: 1, published_at: { not: null }, deleted_at: null },
        by: ['post_id'],
        _count: { _all: true },
      }),
    ]);
    const routeMap = new Map(routeCounts.map((row) => [row.route_id.toString(), row._count._all]));
    const likeMap = new Map(likeCounts.map((row) => [row.target_id.toString(), row._count._all]));
    const replyMap = new Map(replyCounts.map((row) => [row.post_id.toString(), row._count._all]));
    let routeMismatches = 0;
    let postMismatches = 0;
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
    for (const post of posts) {
      const likeCount = likeMap.get(post.id.toString()) ?? 0;
      const replyCount = replyMap.get(post.id.toString()) ?? 0;
      if (post.like_count !== likeCount || post.reply_count !== replyCount) {
        await this.prisma.forumPost.update({
          where: { id: post.id },
          data: { like_count: likeCount, reply_count: replyCount },
        });
        postMismatches += 1;
      }
    }
    const total = routeMismatches + postMismatches;
    this.metrics.increment('counter.reconciliation.runs');
    if (total) this.metrics.increment('counter.reconciliation.mismatches', total);
    return { routes: routeMismatches, forumPosts: postMismatches, total };
  }
}
