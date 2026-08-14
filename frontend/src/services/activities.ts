import { API_BASE } from "@/config";
import { request } from "@/services/request";
import Taro from "@tarojs/taro";
import { confirmSafetyAgreement } from "./safety";
import type { RouteLinkSummary } from "@/types/api";
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
  create: async (data: CreateActivityPayload, idempotencyKey?: string) => {
    const route = Taro.getStorageSync<RouteLinkSummary>("v21:create-route");
    const confirmation = data.agreement ? undefined : await confirmSafetyAgreement("activity_create", `发起活动：${data.title}`);
    if (confirmation === null) throw new Error("已取消发布");
    const result = await request<ActivitySummary>({
      url: `${API_BASE}/activities`,
      method: "POST",
      data: { ...data, route_id: data.route_id ?? route?.id, route_link_source: data.route_link_source ?? (route ? "route_detail" : undefined), agreement: data.agreement ?? confirmation?.agreement },
      headers: (idempotencyKey ?? confirmation?.idempotencyKey) ? { "Idempotency-Key": idempotencyKey ?? confirmation?.idempotencyKey } : undefined,
    });
    Taro.removeStorageSync("v21:create-route");
    return result;
  },
  register: (id: string, agreement?: CreateActivityPayload["agreement"], idempotencyKey?: string) =>
    request<{ status: number }>({
      url: `${API_BASE}/activities/${id}/register`,
      method: "POST",
      data: agreement ? { agreement } : {},
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    }),
  mine: (type: "created" | "registered") =>
    request<ActivityListResponse>({
      url: `${API_BASE}/activities/mine`,
      method: "GET",
      params: { type, page: 1, pageSize: 50 },
    }),
};
