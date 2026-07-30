import { request } from './client';
import type { AdminUser, ContentItem, ListResult, ReportItem, TrendItem, UserItem } from '../types';

export const adminApi = {
  login: (username: string, password: string) => request<{ access_token: string; admin: AdminUser }>({ method: 'POST', url: '/admin/auth/login', data: { username, password } }),
  rides: (params: Record<string, unknown>) => request<ListResult<ContentItem>>({ url: '/admin/rides', params }),
  offlineRide: (id: string) => request<void>({ method: 'POST', url: `/admin/rides/${id}/offline` }),
  deleteRide: (id: string) => request<void>({ method: 'DELETE', url: `/admin/rides/${id}` }),
  activities: (params: Record<string, unknown>) => request<ListResult<ContentItem>>({ url: '/admin/activities', params }),
  offlineActivity: (id: string) => request<void>({ method: 'POST', url: `/admin/activities/${id}/offline` }),
  deleteActivity: (id: string) => request<void>({ method: 'DELETE', url: `/admin/activities/${id}` }),
  users: (params: Record<string, unknown>) => request<ListResult<UserItem>>({ url: '/admin/users', params }),
  userDetail: (id: string) => request<Record<string, unknown>>({ url: `/admin/users/${id}` }),
  banUser: (id: string, reason: string) => request<void>({ method: 'POST', url: `/admin/users/${id}/ban`, data: { reason } }),
  unbanUser: (id: string) => request<void>({ method: 'POST', url: `/admin/users/${id}/unban` }),
  overview: () => request<{ total_users: number; dau: number; today_new_users: number; total_rides: number; total_activities: number }>({ url: '/admin/stats/overview' }),
  trend: (days: 7 | 30) => request<{ list: TrendItem[] }>({ url: '/admin/stats/trend', params: { days } }),
  reports: (params: Record<string, unknown>) => request<ListResult<ReportItem>>({ url: '/admin/reports', params }),
  handleReport: (id: string, action: 'offline' | 'ban' | 'ignore', handling_note?: string) => request<void>({ method: 'POST', url: `/admin/reports/${id}/handle`, data: { action, handling_note } }),
};
