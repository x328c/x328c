import type { RelatedRideListResponse, RouteDetail, RouteDifficulty, RouteListResponse, RouteType } from "@/types/api";
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
};
