import Taro from "@tarojs/taro";
import { API_BASE } from "@/config";
import { AuthTokens, CurrentUser } from "@/types/api";
import { useUserStore } from "@/stores/user-store";
import { useNotificationStore } from "@/stores/notification-store";
import { request } from "./request";
import type { LEGAL_CONSENT } from "@/legal/legal-content";

export type LegalConsent = typeof LEGAL_CONSENT;

interface LoginResult extends AuthTokens {
  user: CurrentUser;
}
/**
 * 确保本地存在可用会话。`force` 用于服务端明确返回 401 后，丢弃旧令牌并重新换取微信会话。
 */
export async function ensureLogin(force = false): Promise<void> {
  const state = useUserStore.getState();
  state.hydrate();
  if (!force && state.accessToken && state.refreshToken && state.user) return;
  throw new Error("请先前往登录页阅读并同意用户协议和隐私政策");
}

export async function loginWithWechat(
  legalConsent: LegalConsent,
): Promise<void> {
  const login = await Taro.login();
  if (!login.code) throw new Error("微信登录未返回 code");
  const result = await request<LoginResult>({
    method: "POST",
    url: `${API_BASE}/auth/wx-login`,
    data: {
      code: login.code,
      legal_consent: legalConsent,
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
  await Taro.removeTabBarBadge({ index: __MESSAGE_TAB_INDEX__ }).catch(() => undefined);
}
