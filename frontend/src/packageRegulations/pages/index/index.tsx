import { Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { StatePanel } from "@/components";
import { trackRegulationEvent } from "@/services/analytics";
import { ApiError } from "@/services/request";
import { regulationService, type RegulationQuery } from "@/services/regulations";
import type { RegulationStatus, RegulationSummary } from "@/types/api";
import "./index.scss";

const categories = [{ label: "全部" }, { value: "city_policy", label: "城市政策" }, { value: "license", label: "驾驶证" }, { value: "vehicle", label: "车辆管理" }, { value: "traffic", label: "交通规则" }];
const statuses: Array<{ value: RegulationStatus; label: string }> = [{ value: 2, label: "现行有效" }, { value: 3, label: "已失效" }, { value: 4, label: "已替代" }];
const statusName = { 2: "现行有效", 3: "已失效", 4: "已替代" } as const;

function RegulationCard({ item, keyword }: { item: RegulationSummary; keyword: string }) {
  return <View className="regulation-card" onClick={() => { trackRegulationEvent("regulation_result_click", { regulation_id: item.id, keyword: keyword || "browse" }); void Taro.navigateTo({ url: `/packageRegulations/pages/detail/index?id=${item.id}` }); }}>
    <View className="regulation-card__top"><Text className={`regulation-card__status regulation-card__status--${item.status}`}>{statusName[item.status]}</Text><Text className="regulation-card__scope">{item.scope === "NATIONAL" ? "全国" : item.regions.map((region) => region.name).join("、")}</Text></View>
    <Text className="regulation-card__title">{item.title}</Text>
    <Text className="regulation-card__meta">{item.document_no || "无文号"} · {item.issuer}</Text>
    <Text className="regulation-card__summary">{item.summary}</Text>
    {item.matched_fields?.length ? <Text className="regulation-card__matched">命中：{item.matched_fields.map((field) => ({ title: "标题", document_no: "文号", issuer: "机构", tag: "标签" }[field] || field)).join("、")}</Text> : null}
    {item.review_overdue ? <Text className="regulation-card__warning">复核已逾期，请以官方原文为准</Text> : null}
  </View>;
}

export default function RegulationListPage() {
  const [items, setItems] = useState<RegulationSummary[]>([]); const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState<RegulationQuery>({ status: 2, limit: 20 }); const [cityCode, setCityCode] = useState("");
  const [cursor, setCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]); const [state, setState] = useState<"loading" | "ready" | "error" | "disabled">("loading");
  const load = useCallback(async (next: RegulationQuery, search: string, append = false) => {
    if (!append) setState("loading");
    try {
      const result = search.trim() ? await regulationService.search(search.trim(), next) : await regulationService.list(next);
      setItems((current) => append ? [...current, ...result.items] : result.items); setCursor(result.nextCursor); setHasMore(result.hasMore); setSuggestions(result.suggestions); setState("ready");
      trackRegulationEvent("regulation_search", { keyword: search.trim() || "browse", category: next.category ?? "all", region_code: next.region_code ?? "all", status: next.status ?? 2, result_count: result.items.length });
    } catch (error) { setState(error instanceof ApiError && error.code === 52001 ? "disabled" : "error"); }
    finally { Taro.stopPullDownRefresh(); }
  }, []);
  useDidShow(() => { trackRegulationEvent("regulation_module_exposure"); void load(query, keyword); });
  usePullDownRefresh(() => void load(query, keyword));
  useReachBottom(() => { if (hasMore && cursor) void load({ ...query, cursor }, keyword, true); });
  const change = (patch: Partial<RegulationQuery>) => { const next = { ...query, ...patch, cursor: undefined }; setQuery(next); void load(next, keyword); };
  const search = () => void load({ ...query, cursor: undefined }, keyword);
  return <View className="regulations-page">
    <View className="regulations-page__hero"><Text className="regulations-page__title">骑行安全手册</Text><Text className="regulations-page__subtitle">官方信息索引与骑行安全知识，不提供个案结论</Text><Input className="regulations-page__search" value={keyword} maxlength={100} placeholder="搜索安全知识、文号、机构或标签" confirmType="search" onInput={(event) => setKeyword(event.detail.value)} onConfirm={search} /></View>
    <View className="regulations-page__guide" onClick={() => { trackRegulationEvent("safety_guide_accident_open"); void Taro.navigateTo({ url: "/packageRegulations/pages/accident-guide/index" }); }}><Text className="regulations-page__guide-title">骑行应急知识</Text><Text>发生事故先确保安全，快速查看报警、取证、协商与复核提示</Text><Text className="regulations-page__guide-action">查看内容 ›</Text></View>
    <ScrollView scrollX className="regulations-page__filters"><View className="regulations-page__row">{categories.map((item) => <Text key={item.value ?? "all"} className={query.category === item.value ? "regulations-page__chip regulations-page__chip--active" : "regulations-page__chip"} onClick={() => change({ category: item.value })}>{item.label}</Text>)}</View></ScrollView>
    <View className="regulations-page__city"><Input value={cityCode} maxlength={6} type="number" placeholder="城市码（如 330100；全国法规始终可见）" onInput={(event) => setCityCode(event.detail.value)} onConfirm={() => change({ region_code: cityCode || undefined })} /></View>
    <ScrollView scrollX className="regulations-page__filters"><View className="regulations-page__row">{statuses.map((item) => <Text key={item.value} className={query.status === item.value ? "regulations-page__chip regulations-page__chip--active" : "regulations-page__chip"} onClick={() => change({ status: item.value })}>{item.label}</Text>)}</View></ScrollView>
    {state === "loading" ? <StatePanel type="loading" title="正在检索官方信息" /> : null}
    {state === "disabled" ? <StatePanel type="disabled" title="骑行安全手册暂未开放" description="路线与同行功能仍可正常使用" actionText="返回同行" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /> : null}
    {state === "error" ? <StatePanel type="error" actionText="重新加载" onAction={() => void load(query, keyword)} /> : null}
    {state === "ready" && !items.length ? <View><StatePanel type="empty" title="未找到匹配法规" description="不会自动生成答案，请尝试以下方式" actionText="清空关键词" onAction={() => { setKeyword(""); void load(query, ""); }} /><View className="regulations-page__suggestions">{suggestions.map((item) => <Text key={item}>· {item}</Text>)}</View></View> : null}
    {state === "ready" && items.length ? <View className="regulations-page__list">{items.map((item) => <RegulationCard key={item.id} item={item} keyword={keyword} />)}<Text className="regulations-page__end">{hasMore ? "上拉加载更多" : "已展示全部结果"}</Text></View> : null}
  </View>;
}
