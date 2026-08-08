import type { ForumBoard, ForumCapability, ForumPostDetail, ForumPostListResponse, ForumPostSummary, ForumReply, ForumReplyListResponse, ForumSubmitState } from "@/types/api";
import { request } from "./request";

export interface ForumPostPayload { board_id: string; title: string; content: string; image_ids: string[] }
export interface ForumReportPayload { content_type: "forum_post" | "forum_reply" | "user"; content_id: string; reason: number; description?: string; source?: "forum" }
export function forumIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const forumService = {
  boards: () => request<{ items: ForumBoard[]; capability: ForumCapability }>({ url: "/forum/boards" }),
  posts: (params: { board_id?: string; sort?: "latest" | "hot"; cursor?: string; limit?: number }) => request<ForumPostListResponse>({ url: "/forum/posts", params }),
  detail: (id: string) => request<ForumPostDetail>({ url: `/forum/posts/${id}` }),
  myPosts: () => request<{ items: ForumPostSummary[] }>({ url: "/forum/me/posts" }),
  myReplies: () => request<{ items: Array<ForumReply & { post: { id: string; title: string; available: boolean } }> }>({ url: "/forum/me/replies" }),
  createPost: (data: ForumPostPayload, key: string) => request<{ id: string; replayed: boolean; state: ForumSubmitState }>({ method: "POST", url: "/forum/posts", data, headers: { "Idempotency-Key": key } }),
  updatePost: (id: string, data: Partial<ForumPostPayload>, key: string) => request<{ id: string; replayed: boolean; state: ForumSubmitState }>({ method: "PATCH", url: `/forum/posts/${id}`, data, headers: { "Idempotency-Key": key } }),
  deletePost: (id: string) => request<{ success: boolean }>({ method: "DELETE", url: `/forum/posts/${id}` }),
  replies: (id: string, params?: { cursor?: string; limit?: number }) => request<ForumReplyListResponse>({ url: `/forum/posts/${id}/replies`, params }),
  createReply: (id: string, content: string, key: string) => request<{ id: string; replayed: boolean; state: ForumSubmitState }>({ method: "POST", url: `/forum/posts/${id}/replies`, data: { content }, headers: { "Idempotency-Key": key } }),
  deleteReply: (id: string) => request<{ success: boolean }>({ method: "DELETE", url: `/forum/replies/${id}` }),
  like: (id: string) => request<{ liked: true; like_count: number }>({ method: "PUT", url: `/forum/posts/${id}/like` }),
  unlike: (id: string) => request<{ liked: false; like_count: number }>({ method: "DELETE", url: `/forum/posts/${id}/like` }),
  report: (data: ForumReportPayload) => request<{ id: string; status: number }>({ method: "POST", url: "/reports", data: { ...data, source: "forum" } }),
};
