import { API_BASE } from "@/config";
import { request } from "@/services/request";
import type {
  ActivityDetail,
  ActivityListResponse,
  ActivitySummary,
  CreateActivityPayload,
} from "@/types/api";

export interface ActivityListParams {
  page?: number;
  pageSize?: number;
  city_code?: string;
  activity_type?: number;
  fee_type?: number;
  start_time?: string;
  end_time?: string;
}

// 服务层显式使用当前环境的 API 根地址，便于检查构建产物和独立调用。
export const activityService = {
  list: (params: ActivityListParams) =>
    request<ActivityListResponse>({
      url: `${API_BASE}/activities`,
      method: "GET",
      params,
    }),
  detail: (id: string) =>
    request<ActivityDetail>({
      url: `${API_BASE}/activities/${id}`,
      method: "GET",
    }),
  create: (data: CreateActivityPayload) =>
    request<ActivitySummary>({
      url: `${API_BASE}/activities`,
      method: "POST",
      data,
    }),
  register: (id: string) =>
    request<{ status: number }>({
      url: `${API_BASE}/activities/${id}/register`,
      method: "POST",
    }),
  mine: (type: "created" | "registered") =>
    request<ActivityListResponse>({
      url: `${API_BASE}/activities/mine`,
      method: "GET",
      params: { type, page: 1, pageSize: 50 },
    }),
};
