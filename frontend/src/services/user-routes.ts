import type { CursorResult, RouteComment, ShareMetadata, UserRoute, UserRoutePayload } from "@/types/api";
import { request } from "./request";

export interface UserRouteQuery {
  cursor?: string; limit?: number; visibility?: 1 | 2; keyword?: string; difficulty?: number;
  min_distance?: number; max_distance?: number; city_code?: string; district_code?: string;
  region_scope?: "any" | "start" | "through";
}

export const userRouteService = {
  create: (data: UserRoutePayload) => request<UserRoute>({ method: "POST", url: "/user-routes", data }),
  update: (id: string, data: Partial<UserRoutePayload>) => request<UserRoute>({ method: "PUT", url: `/user-routes/${id}`, data }),
  mine: (params: UserRouteQuery) => request<CursorResult<UserRoute>>({ url: "/user-routes", params }),
  publicList: (params: UserRouteQuery) => request<CursorResult<UserRoute>>({ url: "/user-routes/public", params }),
  detail: (id: string) => request<UserRoute>({ url: `/user-routes/${id}` }),
  share: (id: string) => request<ShareMetadata>({ url: `/user-routes/${id}/share` }),
  remove: (id: string) => request<{ success: true }>({ method: "DELETE", url: `/user-routes/${id}` }),
  favorite: (id: string) => request<{ favorited: true }>({ method: "POST", url: `/user-routes/${id}/favorite` }),
  comments: (id: string) => request<CursorResult<RouteComment>>({ url: `/user-routes/${id}/comments`, params: { limit: 20 } }),
  createComment: (id: string, content: string, images: string[], key: string) => request<RouteComment>({ method: "POST", url: `/user-routes/${id}/comments`, data: { content, images }, headers: { "Idempotency-Key": key } }),
};
