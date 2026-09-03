import { type PropsWithChildren } from "react";
import Taro, { useDidShow, useLaunch } from "@tarojs/taro";
import { refreshUnreadCount } from "@/services/notification-refresh";
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
  });

  useDidShow(() => {
    void refreshUnreadCount();
  });

  return children;
}

export default App;
