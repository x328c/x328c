import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { RegulationSummary } from "@/types/api";
import { trackRegulationEvent } from "@/services/analytics";
import "./index.scss";

export function SourceBlock({ regulation }: { regulation: RegulationSummary }) {
  const openSource = async () => {
    trackRegulationEvent("regulation_source_open", { regulation_id: regulation.id });
    try {
      await Taro.navigateTo({ url: `/packageRegulations/pages/source/index?url=${encodeURIComponent(regulation.source_url)}&id=${regulation.id}` });
    } catch {
      await Taro.setClipboardData({ data: regulation.source_url });
      Taro.showToast({ title: "链接无法打开，已复制官方地址", icon: "none" });
    }
  };
  return <View className="source-block">
    <Text className="source-block__title">官方来源</Text>
    <Text className="source-block__line">发布机构：{regulation.issuer}</Text>
    <Text className="source-block__line">适用范围：{regulation.scope === "NATIONAL" ? "全国" : regulation.regions.map((item) => item.name).join("、")}</Text>
    <Text className="source-block__line">最后复核：{regulation.last_verified_at ? new Date(regulation.last_verified_at).toLocaleDateString() : "待复核"}</Text>
    <Text className="source-block__url" selectable>{regulation.source_url}</Text>
    <View className="source-block__action" onClick={() => void openSource()}>查看官方原文</View>
  </View>;
}
