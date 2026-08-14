import { API_BASE } from "@/config";
import { request } from "@/services/request";
import type { PublicUserProfile, UserProfile } from "@/types/api";

export interface UpdateProfilePayload {
  nickname?: string;
  avatar_url?: string;
  motorcycle_model?: string;
  riding_years?: number;
  riding_styles?: string[];
  bio?: string;
  wechat_id?: string;
  location_visible?: number;
  wechat_visible?: number;
}

export const userService = {
  profile: () =>
    request<UserProfile>({
      url: `${API_BASE}/users/profile`,
      method: "GET",
    }),
  update: (data: UpdateProfilePayload) =>
    request<UserProfile>({
      url: `${API_BASE}/users/profile`,
      method: "PUT",
      data,
    }),
  closeAccount: () =>
    request<{ success: true }>({
      url: `${API_BASE}/users/account`,
      method: "DELETE",
      data: { confirmed: true },
    }),
  publicProfile: (id: string) =>
    request<PublicUserProfile>({
      url: `${API_BASE}/users/${id}`,
      method: "GET",
    }),
  report: (id: string) =>
    request<void>({
      url: `${API_BASE}/reports`,
      method: "POST",
      data: { content_type: "user", content_id: id, reason: 1 },
    }),
};
