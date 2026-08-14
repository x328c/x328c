import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { RegulationSummary } from "@/types/api";
import { trackRegulationEvent } from "@/services/analytics";
import "./index.scss";

interface GuideSourceProps {
  title: string; issuer: string; sourceUrl: string; publishedAt?: string | null;
  effectiveAt?: string | null; lastVerifiedAt?: string | null;
}
type SourceBlockProps = { regulation: RegulationSummary } | GuideSourceProps;

export function SourceBlock(props: SourceBlockProps) {
  const regulation = "regulation" in props ? props.regulation : undefined;
  const sourceUrl = regulation?.source_url ?? (props as GuideSourceProps).sourceUrl;
  const openSource = async () => {
    trackRegulationEvent(regulation ? "regulation_source_open" : "safety_guide_source_click", regulation ? { regulation_id: regulation.id } : {});
    if (!regulation) {
      await Taro.setClipboardData({ data: sourceUrl });
      Taro.showToast({ title: "官方地址已复制", icon: "success" });
      return;
    }
    try {
      await Taro.navigateTo({ url: `/packageRegulations/pages/source/index?url=${encodeURIComponent(regulation.source_url)}&id=${regulation.id}` });
    } catch {
      await Taro.setClipboardData({ data: sourceUrl });
      Taro.showToast({ title: "链接无法打开，已复制官方地址", icon: "none" });
    }
  };
  return <View className="source-block">
    <Text className="source-block__title">官方来源</Text>
    <Text className="source-block__line">文件名称：{regulation?.title ?? (props as GuideSourceProps).title}</Text>
    <Text className="source-block__line">发布机构：{regulation?.issuer ?? (props as GuideSourceProps).issuer}</Text>
    {regulation ? <Text className="source-block__line">适用范围：{regulation.scope === "NATIONAL" ? "全国" : regulation.regions.map((item) => item.name).join("、")}</Text> : null}
    <Text className="source-block__line">最后复核：{(regulation?.last_verified_at ?? (props as GuideSourceProps).lastVerifiedAt) ? new Date((regulation?.last_verified_at ?? (props as GuideSourceProps).lastVerifiedAt)!).toLocaleDateString() : "待复核"}</Text>
    <Text className="source-block__url" selectable>{sourceUrl}</Text>
    <View className="source-block__action" onClick={() => void openSource()}>查看官方原文</View>
  </View>;
}
