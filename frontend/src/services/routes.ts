import type { CursorResult, RelatedRideListResponse, RouteComment, RouteDetail, RouteDifficulty, RouteListResponse, RouteType } from "@/types/api";
import { request } from "./request";

export interface RouteListQuery {
  city_code?: string; type?: RouteType; difficulty?: RouteDifficulty; cursor?: string; limit?: number;
}

export const routeService = {
  list: (params: RouteListQuery) => request<RouteListResponse>({ url: "/routes", params }),
  detail: (id: string) => request<RouteDetail>({ url: `/routes/${id}` }),
  favorite: (id: string) => request<{ favorited: true; favorite_count: number }>({ method: "PUT", url: `/routes/${id}/favorite` }),
  unfavorite: (id: string) => request<{ favorited: false; favorite_count: number }>({ method: "DELETE", url: `/routes/${id}/favorite` }),
  relatedRides: (id: string) => request<RelatedRideListResponse>({ url: `/routes/${id}/related-rides` }),
  comments: (id: string, cursor?: string) => request<CursorResult<RouteComment>>({ url: `/routes/${id}/comments`, params: { cursor, limit: 20 } }),
  createComment: (id: string, content: string, images: string[], key: string) => request<RouteComment>({ method: "POST", url: `/routes/${id}/comments`, data: { content, images }, headers: { "Idempotency-Key": key } }),
  deleteComment: (id: string) => request<{ success: true }>({ method: "DELETE", url: `/route-comments/${id}` }),
  reportComment: (id: string) => request<{ id: string }>({ method: "POST", url: "/reports", data: { content_type: "route_comment", content_id: id, reason: 1, source: "route" } }),
};
