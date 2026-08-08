import type { RegulationDetail, RegulationListResponse, RegulationStatus } from "@/types/api";
import { request } from "./request";

export interface RegulationQuery {
  category?: string; region_code?: string; scope?: "NATIONAL" | "REGIONAL";
  status?: RegulationStatus; cursor?: string; limit?: number;
}
export const regulationService = {
  list: (params: RegulationQuery) => request<RegulationListResponse>({ url: "/regulations", params }),
  search: (keyword: string, params: RegulationQuery) => request<RegulationListResponse>({ url: "/regulations/search", params: { ...params, keyword } }),
  detail: (id: string) => request<RegulationDetail>({ url: `/regulations/${id}` }),
  feedback: (id: string, data: { type: "content_error" | "expired" | "link_broken"; description?: string }) => request<{ id: string }>({ method: "POST", url: `/regulations/${id}/feedback`, data }),
};
