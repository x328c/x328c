import { API_BASE } from "@/config";
import { request } from "@/services/request";
import type { NotificationListResponse } from "@/types/api";

export const notificationService = {
  list: (category: "all" | "ride_activity" | "system") =>
    request<NotificationListResponse>({
      url: `${API_BASE}/notifications`,
      method: "GET",
      params: { category, page: 1, pageSize: 50 },
    }),
  unreadCount: () =>
    request<{ count: number }>({
      url: `${API_BASE}/notifications/unread-count`,
      method: "GET",
    }),
  read: (id: string) =>
    request<void>({
      url: `${API_BASE}/notifications/${id}/read`,
      method: "POST",
    }),
  readAll: () =>
    request<{ count: number }>({
      url: `${API_BASE}/notifications/read-all`,
      method: "POST",
    }),
};
