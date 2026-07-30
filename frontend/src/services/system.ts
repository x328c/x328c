import { API_BASE } from "@/config";
import { request } from "./request";

export interface HealthStatus {
  status: "ok";
  timestamp: string;
  service: string;
}

export function getHealthStatus(): Promise<HealthStatus> {
  return request<HealthStatus>({
    method: "GET",
    url: `${API_BASE}/health`,
  });
}
