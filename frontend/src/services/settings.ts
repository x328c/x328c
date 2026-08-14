import type { UserSettings } from "@/types/api";
import { request } from "./request";

export const settingsService = {
  get: () => request<UserSettings>({ url: "/users/me/settings" }),
  update: (data: UserSettings) => request<UserSettings>({ method: "PUT", url: "/users/me/settings", data }),
  feedback: (type: "general" | "content_error" | "source_broken" | "product", description: string) => request<{ id: string }>({ method: "POST", url: "/feedback", data: { type, description }, headers: { "Idempotency-Key": `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}` } }),
};
