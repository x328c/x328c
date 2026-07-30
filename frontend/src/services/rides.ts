import { API_BASE } from "@/config";
import { request } from "@/services/request";
import type {
  CreateRidePayload,
  RideDetail,
  RideListResponse,
  RideParticipantsResponse,
  RideSummary,
} from "@/types/api";

export interface RideListParams {
  page?: number;
  pageSize?: number;
  city_code?: string;
  ride_style?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  start_time?: string;
  end_time?: string;
}

export const rideService = {
  list(params: RideListParams) {
    return request<RideListResponse>({
      url: `${API_BASE}/rides`,
      method: "GET",
      params,
    });
  },
  detail(id: string) {
    return request<RideDetail>({
      url: `${API_BASE}/rides/${id}`,
      method: "GET",
    });
  },
  create(payload: CreateRidePayload) {
    return request<RideSummary>({
      url: `${API_BASE}/rides`,
      method: "POST",
      data: payload,
    });
  },
  join(id: string) {
    return request<void>({
      url: `${API_BASE}/rides/${id}/join`,
      method: "POST",
    });
  },
  leave(id: string) {
    return request<void>({
      url: `${API_BASE}/rides/${id}/leave`,
      method: "POST",
    });
  },
  participants(id: string) {
    return request<RideParticipantsResponse>({
      url: `${API_BASE}/rides/${id}/participants`,
      method: "GET",
      params: { page: 1, pageSize: 100 },
    });
  },
  removeParticipant(id: string, userId: string) {
    return request<void>({
      url: `${API_BASE}/rides/${id}/remove-participant`,
      method: "POST",
      data: { user_id: userId },
    });
  },
  mine(type: "created" | "joined") {
    return request<RideListResponse>({
      url: `${API_BASE}/rides/mine`,
      method: "GET",
      params: { type, page: 1, pageSize: 50 },
    });
  },
};
