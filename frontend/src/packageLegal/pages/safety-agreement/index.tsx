import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { FULL_AGREEMENT_STORAGE_KEY } from "@/stores/safety-agreement-store";
import type { SafetyAgreement } from "@/types/api";
import "./index.scss";

interface DocumentLine {
  kind: "title" | "heading" | "paragraph";
  text: string;
}

function parseContent(content: string): DocumentLine[] {
  return content.split(/\r?\n/).flatMap((source): DocumentLine[] => {
    const line = source.trim().replace(/\*\*/g, "");
    if (!line) return [];
    if (line.startsWith("# ")) return [{ kind: "title", text: line.slice(2) }];
    if (line.startsWith("## ")) return [{ kind: "heading", text: line.slice(3) }];
    return [{ kind: "paragraph", text: line }];
  });
}

export default function SafetyAgreementPage() {
  const [agreement, setAgreement] = useState<SafetyAgreement>();

  useLoad(() => {
    const current = Taro.getStorageSync<SafetyAgreement>(FULL_AGREEMENT_STORAGE_KEY);
    if (current?.content) {
      setAgreement(current);
      void Taro.setNavigationBarTitle({ title: current.title || "安全须知全文" });
    }
  });

  if (!agreement) return <View className="safety-document safety-document--empty">
    <Text>安全须知内容暂不可用</Text>
    <Text className="safety-document__back" onClick={() => void Taro.navigateBack()}>返回</Text>
  </View>;

  return <View className="safety-document">
    <View className="safety-document__meta">
      <Text>版本 {agreement.version}</Text>
      <Text>适用操作：骑行同行与活动的发起、加入和报名</Text>
    </View>
    {parseContent(agreement.content).map((line, index) => <Text key={`${line.kind}-${index}`} className={`safety-document__${line.kind}`}>{line.text}</Text>)}
    <View className="safety-document__footer-space" />
    <View className="safety-document__footer">
      <Text onClick={() => void Taro.navigateBack()}>返回确认</Text>
    </View>
  </View>;
}
