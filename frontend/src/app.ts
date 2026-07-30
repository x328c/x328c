import type { PropsWithChildren } from "react";
import Taro, { useLaunch } from "@tarojs/taro";
import { notificationService } from "@/services/notifications";
import { useNotificationStore } from "@/stores/notification-store";
import { useUserStore } from "@/stores/user-store";

import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) {
      void Taro.reLaunch({ url: "/pages/auth/index" });
      return;
    }
    void notificationService.unreadCount().then(async ({ count }) => {
      useNotificationStore.getState().setUnreadCount(count);
      if (count > 0) await Taro.setTabBarBadge({ index: 1, text: String(count > 99 ? "99+" : count) });
      else await Taro.removeTabBarBadge({ index: 1 });
    }).catch(() => undefined);
  });

  return children;
}

export default App;
