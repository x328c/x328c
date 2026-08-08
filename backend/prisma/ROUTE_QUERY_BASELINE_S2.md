# S2 route query and index baseline

Date: 2026-07-31  
Engine: MySQL 8.0 in a disposable local container  
Dataset: 1,000 generated non-production routes, 900 published and 100 drafts

## Indexes

Public route list indexes:

- `routes_status_sort_weight_updated_at_id_idx`: default public list and stable cursor order;
- `routes_status_city_code_sort_weight_updated_at_id_idx`: city list and stable cursor order;
- `routes_status_type_difficulty_sort_weight_updated_at_id_idx`: type/difficulty filters and stable cursor order.

Other integrity/query indexes:

- `route_points(route_id, order)` unique for stable point ordering;
- `route_favorites(user_id, route_id)` unique for idempotent favorites;
- `route_favorites(route_id, created_at)` for count reconciliation;
- `route_ride_links(route_id, ride_id)` unique and `route_ride_links(ride_id)` for related rides;
- primary-key lookup for route detail, plus `deleted_at` and maintainer/admin list indexes.

## `EXPLAIN ANALYZE` results

All timings below are database execution times from a warm disposable instance and exclude HTTP, serialization, Redis, and network latency.

| Query | Selected access path | Actual time |
|---|---|---:|
| Published list, no filters, limit 20 | reverse lookup on `routes_status_sort_weight_updated_at_id_idx` | 0.0535–0.0722 ms |
| Published city list, limit 20 | reverse lookup on `routes_status_city_code_sort_weight_updated_at_id_idx` | 0.0261–0.0426 ms |
| Published type+difficulty list, limit 20 | reverse lookup on `routes_status_type_difficulty_sort_weight_updated_at_id_idx` | 0.0246–0.0467 ms |
| City+type+difficulty list, limit 20 | type+difficulty index plus city residual filter | 0.0371–0.0654 ms |

No filesort appeared in these representative plans. The cursor uses the same `sort_weight DESC, updated_at DESC, id DESC` tuple as the index order.

## Interpretation and limits

This evidence confirms correct index selection at 1,000 rows, not production P95. The product target must be re-measured with realistic data distribution, concurrent traffic, deployed network latency, and cache hit ratios before gray release. S5 should add slow-query telemetry and repeat the baseline at the expected production route volume.
