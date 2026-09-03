import type { RouteListQuery } from '@/services/routes';
import type { UserRouteQuery } from '@/services/user-routes';
import type { CursorResult, RouteSummary, UserRoute } from '@/types/api';

export type RouteSource = 'all' | 'official' | 'user';
export type RouteFeedItem = { source: 'official'; route: RouteSummary } | { source: 'user'; route: UserRoute };
export interface RouteFeedCursor { group: number; cursor?: string }
export interface RouteFeedQuery {
  source: RouteSource;
  official: RouteListQuery;
  user: UserRouteQuery;
  limit?: number;
}
interface Loaders {
  official: (query: RouteListQuery) => Promise<CursorResult<RouteSummary>>;
  user: (query: UserRouteQuery) => Promise<CursorResult<UserRoute>>;
}

/** Region rank precedes source rank, including across pages. Each API still
 * applies its own stable weight/date/ID ordering. Continuations belong to one
 * filter snapshot; callers must discard them whenever that snapshot changes. */
export async function loadRouteFeedPage(query: RouteFeedQuery, loaders: Loaders, continuation?: RouteFeedCursor) {
  const sources = query.source === 'all' ? ['official', 'user'] as const : [query.source];
  const scopes = query.official.city_code || query.user.city_code ? ['start', 'through'] as const : ['any'] as const;
  const groups = scopes.flatMap((scope) => sources.map((source) => ({ scope, source })));
  let group = continuation?.group ?? 0;
  let cursor = continuation?.cursor;
  const items: RouteFeedItem[] = [];
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('无效的路线分页大小');
  while (group < groups.length && items.length < limit) {
    const { scope, source } = groups[group];
    const pageQuery = { region_scope: scope, cursor, limit: limit - items.length };
    const result = source === 'official'
      ? await loaders.official({ ...query.official, ...pageQuery })
      : await loaders.user({ ...query.user, ...pageQuery });
    if (result.hasMore && (!result.nextCursor || result.nextCursor === cursor || !result.items.length)) {
      throw new Error('路线分页异常，请刷新后重试');
    }
    if (source === 'official') items.push(...(result.items as RouteSummary[]).map((route) => ({ source, route })));
    else items.push(...(result.items as UserRoute[]).map((route) => ({ source, route })));
    if (result.hasMore) {
      cursor = result.nextCursor!;
      break;
    }
    group++;
    cursor = undefined;
  }
  return { items, continuation: group < groups.length ? { group, cursor } : null };
}
