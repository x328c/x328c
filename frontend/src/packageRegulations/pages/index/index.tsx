import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { StatePanel } from "@/components";
import { trackRegulationEvent } from "@/services/analytics";
import { ApiError } from "@/services/request";
import { regulationService, type RegulationQuery } from "@/services/regulations";
import { safetyService } from "@/services/safety";
import type { SafetyGuide } from "@/types/api";
import type { RegulationSummary } from "@/types/api";
import "./index.scss";

const statusName = { 2: "现行有效", 3: "已失效", 4: "已替代" } as const;
const openPage = async (url: string) => {
  try { await Taro.navigateTo({ url }); }
  catch { Taro.showToast({ title: "页面打开超时，请重新点击", icon: "none" }); }
};

function RegulationCard({ item, keyword }: { item: RegulationSummary; keyword: string }) {
  return <View className="regulation-card" onClick={() => { trackRegulationEvent("regulation_result_click", { regulation_id: item.id, keyword: keyword || "browse" }); void openPage(`/packageRegulations/pages/detail/index?id=${item.id}`); }}>
    <View className="regulation-card__top"><Text className={`regulation-card__status regulation-card__status--${item.status}`}>{statusName[item.status]}</Text><Text className="regulation-card__scope">{item.scope === "NATIONAL" ? "全国" : item.regions.map((region) => region.name).join("、")}</Text></View>
    <Text className="regulation-card__title">{item.title}</Text>
    <Text className="regulation-card__meta">{item.document_no || "无文号"} · {item.issuer}</Text>
    <Text className="regulation-card__summary" userSelect>{item.summary}</Text>
    {item.matched_fields?.length ? <Text className="regulation-card__matched">命中：{item.matched_fields.map((field) => ({ title: "标题", document_no: "文号", issuer: "机构", tag: "标签" }[field] || field)).join("、")}</Text> : null}
    {item.review_overdue ? <Text className="regulation-card__warning">复核已逾期，请以官方原文为准</Text> : null}
  </View>;
}

export default function RegulationListPage() {
  const [items, setItems] = useState<RegulationSummary[]>([]); const [keyword, setKeyword] = useState("");
  const [query] = useState<RegulationQuery>({ status: 2, limit: 20 });
  const [initiative, setInitiative] = useState<SafetyGuide>();
  const [initiativeState, setInitiativeState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [cursor, setCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]); const [state, setState] = useState<"loading" | "ready" | "error" | "disabled">("loading");
  const load = useCallback(async (next: RegulationQuery, search: string, append = false) => {
    if (!append) setState("loading");
    try {
      const result = search.trim() ? await regulationService.search(search.trim(), next) : await regulationService.list(next);
      setItems((current) => append ? [...current, ...result.items] : result.items); setCursor(result.nextCursor); setHasMore(result.hasMore); setSuggestions(result.suggestions); setState("ready");
      trackRegulationEvent("regulation_search", { keyword: search.trim() || "browse", status: 2, result_count: result.items.length });
    } catch (error) { setState(error instanceof ApiError && error.code === 52001 ? "disabled" : "error"); }
    finally { Taro.stopPullDownRefresh(); }
  }, []);
  useDidShow(() => {
    trackRegulationEvent("regulation_module_exposure");
    void load(query, keyword);
    setInitiativeState("loading");
    void safetyService.safeRidingInitiative().then((result) => { setInitiative(result); setInitiativeState("ready"); }).catch((error) => setInitiativeState(error instanceof ApiError && error.code === 56008 ? "empty" : "error"));
  });
  usePullDownRefresh(() => void load(query, keyword));
  useReachBottom(() => { if (hasMore && cursor) void load({ ...query, cursor }, keyword, true); });
  const search = () => void load({ ...query, cursor: undefined }, keyword);
  return <View className="regulations-page">
    <View className="regulations-page__hero"><Text className="regulations-page__title">骑行安全手册</Text><Text className="regulations-page__subtitle">官方信息索引与骑行安全知识，不提供个案结论</Text><Input className="regulations-page__search" value={keyword} maxlength={100} placeholder="搜索安全知识、文号、机构或标签" confirmType="search" onInput={(event) => setKeyword(event.detail.value)} onConfirm={search} /></View>
    <View className="regulations-page__initiative" onClick={() => { if (initiativeState === "ready") void openPage("/packageRegulations/pages/safe-riding-initiative/index"); }}><Text className="regulations-page__guide-title">{initiative?.title ?? "安全骑行倡议"}</Text><Text userSelect>{initiativeState === "loading" ? "正在加载倡议…" : initiativeState === "ready" ? initiative?.summary : initiativeState === "empty" ? "倡议内容正在完善" : "倡议暂时无法加载，法规检索不受影响"}</Text>{initiativeState === "ready" ? <Text className="regulations-page__guide-action">阅读全文 ›</Text> : null}</View>
    <View className="regulations-page__guide" onClick={() => { trackRegulationEvent("safety_guide_accident_open"); void openPage("/packageRegulations/pages/accident-guide/index"); }}><Text className="regulations-page__guide-title">骑行应急知识</Text><Text userSelect>发生事故先确保安全，快速查看报警、取证、协商与复核提示</Text><Text className="regulations-page__guide-action">查看内容 ›</Text></View>
    {state === "loading" ? <StatePanel type="loading" title="正在检索官方信息" /> : null}
    {state === "disabled" ? <StatePanel type="disabled" title="骑行安全手册暂未开放" description="路线与同行功能仍可正常使用" actionText="返回同行" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /> : null}
    {state === "error" ? <StatePanel type="error" actionText="重新加载" onAction={() => void load(query, keyword)} /> : null}
    {state === "ready" && !items.length ? <View><StatePanel type="empty" title="暂无匹配的摩托车相关法规" description="可清空关键词查看全部现行有效内容" actionText="清空关键词" onAction={() => { setKeyword(""); void load(query, ""); }} /><View className="regulations-page__suggestions">{suggestions.map((item) => <Text key={item}>· {item}</Text>)}</View></View> : null}
    {state === "ready" && items.length ? <View className="regulations-page__list">{items.map((item) => <RegulationCard key={item.id} item={item} keyword={keyword} />)}<Text className="regulations-page__end">{hasMore ? "上拉加载更多" : "已展示全部结果"}</Text></View> : null}
  </View>;
}
