import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { SourceBlock, StatePanel } from "@/components";
import { safetyService } from "@/services/safety";
import type { SafetyGuide } from "@/types/api";
import "./index.scss";

interface GuideContent { alert?: string; disclaimer?: string; sections?: Array<{ title: string; items?: string[]; paragraphs?: string[] }> }
export default function AccidentGuidePage() {
  const [guide, setGuide] = useState<SafetyGuide>();
  const [state, setState] = useState<"loading" | "ready" | "disabled" | "error">("loading");
  const load = async () => {
    setState("loading");
    try { setGuide(await safetyService.accidentGuide()); setState("ready"); }
    catch (error) { setState(error instanceof Error && error.message.includes("未开放") ? "disabled" : "error"); }
  };
  useLoad(() => void load());
  if (state === "loading") return <StatePanel type="loading" title="正在加载骑行应急知识" />;
  if (state === "disabled") return <StatePanel type="disabled" title="骑行应急知识正在复核" description="安全知识检索仍可正常使用" actionText="返回" onAction={() => Taro.navigateBack()} />;
  if (state === "error" || !guide) return <StatePanel type="error" title="骑行应急知识加载失败" actionText="重试" onAction={() => void load()} />;
  const content = guide.content as GuideContent;
  return <View className="accident-guide">
    {guide.stale ? <View className="accident-guide__stale">规则可能已更新，请优先查看官方原文。</View> : null}
    <View className="accident-guide__alert"><Text>{content.alert || "如有人身危险，请优先联系 110/120 并服从现场人员指挥。"}</Text><Text>{content.disclaimer || "本指南不判断事故责任，不替代公安交管、保险机构或专业法律意见。"}</Text></View>
    {(content.sections ?? []).map((section, index) => <View className="accident-guide__section" key={`${index}-${section.title}`}><Text className="accident-guide__title">{index + 1}. {section.title}</Text>{section.paragraphs?.map((item) => <Text className="accident-guide__copy" key={item}>{item}</Text>)}{section.items?.map((item) => <Text className="accident-guide__item" key={item}>• {item}</Text>)}</View>)}
    <SourceBlock title={guide.source.title} issuer={guide.source.issuer} sourceUrl={guide.source.url} publishedAt={guide.source.publishedAt} effectiveAt={guide.source.effectiveAt} lastVerifiedAt={guide.lastVerifiedAt} />
    <View className="accident-guide__feedback" onClick={() => Taro.navigateTo({ url: "/pages/settings/index?feedback=source_broken" })}>内容有误 / 来源失效 ›</View>
  </View>;
}
