import { Text, View, WebView } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { regulationService } from "@/services/regulations";
import { useUserStore } from "@/stores/user-store";
import { openLogin } from "@/utils/login-return";
import "./index.scss";

export default function RegulationSourcePage() {
  const [url, setUrl] = useState(""); const [id, setId] = useState(""); const [failed, setFailed] = useState(false);
  useLoad((options) => {
    const decoded = decodeURIComponent(options.url || "");
    if (/^https?:\/\//.test(decoded)) setUrl(decoded); else setFailed(true);
    setId(options.id || ""); useUserStore.getState().hydrate();
  });
  const report = async () => {
    if (!id) return;
    if (!useUserStore.getState().isLoggedIn) { await openLogin(`/packageRegulations/pages/detail/index?id=${id}`); return; }
    await regulationService.feedback(id, { type: "link_broken", description: "小程序内打开官方来源失败" });
    Taro.showToast({ title: "已提交链接失效反馈", icon: "success" });
  };
  if (failed || !url) return <View className="source-page"><StatePanel type="error" title="官方链接暂时无法打开" description="来源地址仍保留在下方，可复制后使用浏览器访问。" /><Text className="source-page__url" selectable>{url || "来源地址无效"}</Text><View className="source-page__actions"><View onClick={() => void Taro.setClipboardData({ data: url })}>复制官方地址</View><View onClick={() => void report()}>反馈链接失效</View></View></View>;
  return <View className="source-page"><WebView src={url} onError={() => setFailed(true)} /></View>;
}
