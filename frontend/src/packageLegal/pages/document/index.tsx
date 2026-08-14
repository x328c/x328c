import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { isLegalDocumentKey, LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/legal/legal-content";
import "./index.scss";

interface LegalLine {
  kind: "title" | "heading" | "paragraph" | "bullet";
  text: string;
}

function parseMarkdown(markdown: string): LegalLine[] {
  return markdown.split(/\r?\n/).flatMap((source): LegalLine[] => {
    const line = source.trim();
    if (!line) return [];
    const text = line.replace(/\*\*/g, "").replace(/ {2}$/g, "");
    if (text.startsWith("# ")) return [{ kind: "title", text: text.slice(2) }];
    if (text.startsWith("## ")) return [{ kind: "heading", text: text.slice(3) }];
    if (/^[-*] /.test(text)) return [{ kind: "bullet", text: `• ${text.slice(2)}` }];
    return [{ kind: "paragraph", text }];
  });
}

export default function LegalDocumentPage() {
  const [type, setType] = useState<LegalDocumentKey>("user-agreement");

  useLoad((options) => {
    if (isLegalDocumentKey(options.type)) {
      setType(options.type);
      Taro.setNavigationBarTitle({ title: LEGAL_DOCUMENTS[options.type].title });
    }
  });

  const document = LEGAL_DOCUMENTS[type];
  return <View className="legal-document">
    {parseMarkdown(document.content).map((line, index) => <Text key={`${line.kind}-${index}`} className={`legal-document__${line.kind}`}>{line.text}</Text>)}
    <Text className="legal-document__footer">文档版本：{__LEGAL_BUNDLE_VERSION__}</Text>
  </View>;
}
