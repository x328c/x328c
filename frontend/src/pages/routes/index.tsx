import { Image, Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { StatePanel } from "@/components";
import { trackRouteEvent } from "@/services/analytics";
import { ApiError } from "@/services/request";
import { routeService, type RouteListQuery } from "@/services/routes";
import type { RouteDifficulty, RouteSummary, RouteType } from "@/types/api";
import "./index.scss";

const types: Array<{ value?: RouteType; label: string }> = [
  { label: "全部" }, { value: "scenic", label: "风景" }, { value: "mountain", label: "跑山" },
  { value: "touring", label: "摩旅" }, { value: "urban", label: "城市" },
];
const difficulties: Array<{ value?: RouteDifficulty; label: string }> = [
  { label: "全部难度" }, { value: "easy", label: "轻松" },
  { value: "moderate", label: "适中" }, { value: "hard", label: "挑战" },
];
const difficultyNames: Record<RouteDifficulty, string> = { easy: "轻松", moderate: "适中", hard: "挑战" };

function RouteCard({ route }: { route: RouteSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <View className="route-card" onClick={() => Taro.navigateTo({ url: `/packageRoutes/pages/detail/index?id=${route.id}` })}>
    {route.cover_image && !imageFailed
      ? <Image className="route-card__cover" mode="aspectFill" src={route.cover_image} onError={() => setImageFailed(true)} />
      : <View className="route-card__cover route-card__cover--placeholder">摩搭子路线</View>}
    <View className="route-card__body">
      <Text className="route-card__title">{route.title}</Text>
      <Text className="route-card__meta">{route.city_name || route.city_code || "城市待补充"} · {route.difficulty ? difficultyNames[route.difficulty] : "难度待补充"}</Text>
      <Text className="route-card__summary">{route.summary || "运营精选骑行路线"}</Text>
      <View className="route-card__facts">
        <Text>{route.distance_km ? `${route.distance_km} km` : "里程待补充"}</Text>
        <Text>{route.duration_min ? `约 ${Math.ceil(route.duration_min / 60)} 小时` : "时长待补充"}</Text>
        {route.is_favorited ? <Text className="route-card__favorite">已收藏</Text> : null}
      </View>
    </View>
  </View>;
}

export default function RoutesPage() {
  const [items, setItems] = useState<RouteSummary[]>([]);
  const [query, setQuery] = useState<RouteListQuery>({ limit: 20 });
  const [cityCode, setCityCode] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error" | "disabled">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (nextQuery: RouteListQuery, append = false) => {
    if (append) setLoadingMore(true); else setState("loading");
    try {
      const result = await routeService.list(nextQuery);
      setItems((current) => append ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor); setHasMore(result.hasMore); setState("ready");
      trackRouteEvent("route_list_result", {
        city_code: nextQuery.city_code ?? "all",
        type: nextQuery.type ?? "all",
        difficulty: nextQuery.difficulty ?? "all",
        result_count: result.items.length,
        has_more: result.hasMore,
        append,
      });
    } catch (error) {
      setState(error instanceof ApiError && error.code === 52001 ? "disabled" : "error");
    } finally { setLoadingMore(false); }
  }, []);

  useDidShow(() => {
    trackRouteEvent("route_module_exposure");
    void load(query);
  });
  const changeFilter = (patch: Partial<RouteListQuery>) => {
    const next = { ...query, ...patch, cursor: undefined };
    trackRouteEvent("route_filter", {
      city_code: next.city_code ?? "all",
      type: next.type ?? "all",
      difficulty: next.difficulty ?? "all",
    });
    setQuery(next); setNextCursor(null); void load(next);
  };
  const clearFilters = () => { setCityCode(""); const next = { limit: 20 }; setQuery(next); void load(next); };
  const loadMore = () => { if (hasMore && nextCursor && !loadingMore) void load({ ...query, cursor: nextCursor }, true); };

  return <View className="routes-page">
    <View className="routes-page__hero">
      <Text className="routes-page__title">本城路线</Text>
      <Text className="routes-page__subtitle">按路线起点城市发现运营精选路线</Text>
      <View className="routes-page__user-actions"><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/square/index" })}>路线广场</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/mine/index" })}>我的路线</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/create/index" })}>+ 录入路线</Text></View>
      <Input className="routes-page__city" value={cityCode} maxlength={20} placeholder="输入城市码筛选，例如 330100" onInput={(event) => setCityCode(event.detail.value)} onConfirm={() => changeFilter({ city_code: cityCode.trim() || undefined })} />
    </View>
    <ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">
      {types.map((item) => <Text key={item.value ?? "all"} className={query.type === item.value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeFilter({ type: item.value })}>{item.label}</Text>)}
    </View></ScrollView>
    <ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">
      {difficulties.map((item) => <Text key={item.value ?? "all"} className={query.difficulty === item.value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeFilter({ difficulty: item.value })}>{item.label}</Text>)}
    </View></ScrollView>
    {state === "loading" ? <StatePanel type="loading" title="正在加载精选路线" /> : null}
    {state === "disabled" ? <StatePanel type="disabled" title="路线功能暂未开放" description="同行功能仍可正常使用" actionText="返回同行" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /> : null}
    {state === "error" ? <StatePanel type="error" actionText="重新加载" onAction={() => void load(query)} /> : null}
    {state === "ready" && !items.length ? <StatePanel type="empty" title="没有匹配路线" description="换个城市或筛选条件试试" actionText="清除筛选" onAction={clearFilters} /> : null}
    {state === "ready" && items.length ? <View className="routes-page__list">
      {items.map((route) => <RouteCard key={route.id} route={route} />)}
      {hasMore ? <View className="routes-page__more" onClick={loadMore}>{loadingMore ? "加载中…" : "加载更多"}</View> : <View className="routes-page__end">已展示全部路线</View>}
    </View> : null}
  </View>;
}
