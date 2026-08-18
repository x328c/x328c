import type { PropsWithChildren } from "react";
import Taro, { useLaunch } from "@tarojs/taro";
import { notificationService } from "@/services/notifications";
import { useNotificationStore } from "@/stores/notification-store";
import { useUserStore } from "@/stores/user-store";

import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) {
      if (["pages/routes/index", "packageRoutes/pages/detail/index", "packageRegulations/pages/index/index", "packageRegulations/pages/detail/index", "packageRegulations/pages/source/index", "packageRegulations/pages/safe-riding-initiative/index"].includes(options.path)) return;
      void Taro.reLaunch({ url: "/pages/auth/index" });
      return;
    }
    void notificationService.unreadCount().then(async ({ count }) => {
      useNotificationStore.getState().setUnreadCount(count);
      if (count > 0) {
        await Taro.setTabBarBadge({
          index: __MESSAGE_TAB_INDEX__,
          text: String(count > 99 ? "99+" : count),
        });
      } else {
        await Taro.removeTabBarBadge({ index: __MESSAGE_TAB_INDEX__ });
      }
    }).catch(() => undefined);
  });

  return children;
}

export default App;
