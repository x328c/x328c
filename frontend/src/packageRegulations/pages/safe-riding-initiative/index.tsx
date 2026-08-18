import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { safetyService } from "@/services/safety";
import { ApiError } from "@/services/request";
import type { SafetyGuide } from "@/types/api";
import "./index.scss";

interface InitiativeContent {
  schema?: "safe_riding_initiative/v1";
  intro?: string;
  sections?: Array<{ order: number; title: string; body: string }>;
  sources?: Array<{ title: string; url: string; description: string }>;
  disclaimer?: string;
}

export default function SafeRidingInitiativePage() {
  const [guide, setGuide] = useState<SafetyGuide>();
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const load = async () => {
    setState("loading");
    try {
      setGuide(await safetyService.safeRidingInitiative());
      setState("ready");
    } catch (error) {
      setState(error instanceof ApiError && error.code === 56008 ? "empty" : "error");
    }
  };
  useLoad(() => void load());
  if (state === "loading") return <StatePanel type="loading" title="正在加载安全骑行倡议" />;
  if (state === "empty") return <StatePanel type="empty" title="倡议内容正在完善" description="法规检索仍可正常使用" actionText="返回手册" onAction={() => Taro.navigateBack()} />;
  if (state === "error" || !guide) return <StatePanel type="error" title="倡议加载失败" actionText="重试" onAction={() => void load()} />;
  const content = guide.content as InitiativeContent;
  return <View className="initiative">
    <View className="initiative__hero"><Text className="initiative__eyebrow">安全骑行 · 文明同行</Text><Text className="initiative__title">{guide.title}</Text><Text className="initiative__meta">版本 {guide.version} · 最近复核 {guide.lastVerifiedAt ? new Date(guide.lastVerifiedAt).toLocaleDateString() : "待补充"}</Text><Text className="initiative__summary" userSelect>{content.intro ?? guide.summary}</Text></View>
    {(content.sections ?? []).map((section) => <View className="initiative__section" key={section.order}><View className="initiative__section-head"><Text className="initiative__number">{String(section.order).padStart(2, "0")}</Text><Text className="initiative__heading">{section.title}</Text></View><Text className="initiative__copy" userSelect>{section.body}</Text></View>)}
    <View className="initiative__sources"><Text className="initiative__heading">来源与编制依据</Text><Text className="initiative__source-tip">点击来源可复制官方链接</Text>{(content.sources ?? []).map((source, index) => <View className="initiative__source" key={source.url} onClick={() => Taro.setClipboardData({ data: source.url })}><Text className="initiative__source-index">{index + 1}</Text><View className="initiative__source-content"><Text className="initiative__source-title">{source.title}</Text><Text className="initiative__source-description" userSelect>{source.description}</Text></View></View>)}</View>
    <Text className="initiative__notice" userSelect>{content.disclaimer ?? guide.notice ?? "内容为一般安全提示，请以现行法律法规及现场管理要求为准。"}</Text>
  </View>;
}
