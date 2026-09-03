import Taro from "@tarojs/taro";
import { create } from "zustand";

interface NotificationState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

export const syncNotificationBadge = async (count: number): Promise<void> => {
  if (count > 0) {
    await Taro.setTabBarBadge({
      index: __MESSAGE_TAB_INDEX__,
      text: String(count > 99 ? "99+" : count),
    });
    return;
  }
  await Taro.removeTabBarBadge({ index: __MESSAGE_TAB_INDEX__ });
};

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => {
    const unreadCount = Math.max(0, Math.trunc(count));
    set({ unreadCount });
    // 微信原生 TabBar 的角标状态独立于 React；即使数值没有变化也必须主动同步。
    void syncNotificationBadge(unreadCount).catch(() => undefined);
  },
}));
