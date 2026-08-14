import axios from 'axios';
import { message } from 'antd';
import type { ApiEnvelope } from '../types';
import { useAuthStore } from '../stores/auth-store';

const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1');
export const client = axios.create({ baseURL: API_BASE.replace(/\/+$/, ''), timeout: 15_000 });
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token || localStorage.getItem('jiangxing_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) useAuthStore.getState().logout();
    const text = error.response?.data?.message || error.message || '请求失败';
    message.error(text);
    return Promise.reject(error);
  },
);

export async function request<T>(config: Parameters<typeof client.request>[0]): Promise<T> {
  const response = await client.request<ApiEnvelope<T>>(config);
  const payload = response.data;
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) throw new Error(payload.message);
    return payload.data;
  }
  return response.data as unknown as T;
}
