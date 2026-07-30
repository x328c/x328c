import Taro from "@tarojs/taro";
import { API_BASE } from "@/config";
import { AuthTokens, CurrentUser } from "@/types/api";
import { useUserStore } from "@/stores/user-store";
import { useNotificationStore } from "@/stores/notification-store";
import { request } from "./request";

interface LoginResult extends AuthTokens {
  user: CurrentUser;
}
let loginPromise: Promise<void> | null = null;

/**
 * 确保本地存在可用会话。`force` 用于服务端明确返回 401 后，丢弃旧令牌并重新换取微信会话。
 */
export async function ensureLogin(force = false): Promise<void> {
  const state = useUserStore.getState();
  state.hydrate();
  if (!force && state.accessToken && state.refreshToken && state.user) return;
  loginPromise ??= loginWithWechat().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}

export async function loginWithWechat(userInfo?: { nickName: string; avatarUrl: string }): Promise<void> {
  const login = await Taro.login();
  if (!login.code) throw new Error("微信登录未返回 code");
  const result = await request<LoginResult>({
    method: "POST",
    url: `${API_BASE}/auth/wx-login`,
    data: {
      code: login.code,
      ...(userInfo
        ? { nickname: userInfo.nickName, avatar_url: userInfo.avatarUrl }
        : {}),
    },
  });
  useUserStore
    .getState()
    .setSession(result.access_token, result.refresh_token, result.user);
}

/** 先让服务端撤销当前 Access/Refresh Token，再清理小程序本地会话。 */
export async function logout(): Promise<void> {
  const state = useUserStore.getState();
  await state.logout(async () => {
    if (!state.accessToken) return;
    await request<void>({
      method: "POST",
      url: `${API_BASE}/auth/logout`,
      data: state.refreshToken ? { refresh_token: state.refreshToken } : {},
    });
  });
  useNotificationStore.getState().setUnreadCount(0);
  await Taro.removeTabBarBadge({ index: 1 }).catch(() => undefined);
}
