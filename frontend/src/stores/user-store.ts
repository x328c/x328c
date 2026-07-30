import Taro from "@tarojs/taro";
import { create } from "zustand";
import { STORAGE_KEYS } from "@/constants";
import { CurrentUser } from "@/types/api";

interface UserState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  isLoggedIn: boolean;
  setSession: (
    accessToken: string,
    refreshToken: string,
    user: CurrentUser,
  ) => void;
  hydrate: () => void;
  /** 只清理本地会话，可用于令牌失效等场景。 */
  resetUser: () => void;
  /** 先执行可选的服务端撤销操作，再无条件清理本地会话。 */
  logout: (revoke?: () => Promise<void>) => Promise<void>;
  clearSession: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoggedIn: false,
  setSession: (accessToken, refreshToken, user) => {
    Taro.setStorageSync(STORAGE_KEYS.accessToken, accessToken);
    Taro.setStorageSync(STORAGE_KEYS.refreshToken, refreshToken);
    Taro.setStorageSync(STORAGE_KEYS.user, user);
    set({ accessToken, refreshToken, user, isLoggedIn: true });
  },
  hydrate: () =>
    {
      const accessToken = Taro.getStorageSync<string>(STORAGE_KEYS.accessToken) || null;
      const refreshToken = Taro.getStorageSync<string>(STORAGE_KEYS.refreshToken) || null;
      const user = Taro.getStorageSync<CurrentUser>(STORAGE_KEYS.user) || null;
      set({ accessToken, refreshToken, user, isLoggedIn: Boolean(accessToken && refreshToken && user) });
    },
  resetUser: () => {
    Taro.removeStorageSync(STORAGE_KEYS.accessToken);
    Taro.removeStorageSync(STORAGE_KEYS.refreshToken);
    Taro.removeStorageSync(STORAGE_KEYS.user);
    set({ accessToken: null, refreshToken: null, user: null, isLoggedIn: false });
  },
  logout: async (revoke) => {
    try {
      await revoke?.();
    } catch {
      // 服务端撤销失败不能阻止用户在本机退出；本地凭据仍必须被清除。
    } finally {
      get().resetUser();
    }
  },
  clearSession: () => get().resetUser(),
}));
