import { Image, Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { useCallback, useRef, useState } from "react";
import { StatePanel } from "@/components";
import { trackRouteEvent } from "@/services/analytics";
import { routeService, type RouteListQuery } from "@/services/routes";
import { userRouteService } from "@/services/user-routes";
import { useRegionStore, type SelectedRegion } from "@/stores/region-store";
import type { RouteDifficulty, RouteSummary, RouteType, UserRoute } from "@/types/api";
import { loadRouteFeedPage, type RouteFeedCursor, type RouteFeedItem, type RouteFeedQuery, type RouteSource } from "@/utils/route-feed";
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
type SourceFilter = RouteSource;
const feedLoaders = { official: routeService.list, user: userRouteService.publicList };

function OfficialRouteCard({ route }: { route: RouteSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <View className="route-card" onClick={() => Taro.navigateTo({ url: `/packageRoutes/pages/detail/index?id=${route.id}` })}>
    {route.cover_image && !imageFailed ? <Image className="route-card__cover" mode="aspectFill" src={route.cover_image} onError={() => setImageFailed(true)} /> : <View className="route-card__cover route-card__cover--placeholder">官方路线</View>}
    <View className="route-card__body"><Text className="route-card__title">{route.title}</Text><Text className="route-card__meta">官方精选 · {route.city_name || route.city_code || "城市待补充"} · {route.difficulty ? difficultyNames[route.difficulty] : "难度待补充"}{route.region_match === "through" ? " · 途经本地" : ""}</Text><Text className="route-card__summary">{route.summary || "运营精选骑行路线"}</Text><View className="route-card__facts"><Text>{route.distance_km ? `${route.distance_km} km` : "里程待补充"}</Text><Text>{route.duration_min ? `约 ${Math.ceil(route.duration_min / 60)} 小时` : "时长待补充"}</Text></View></View>
  </View>;
}

function UserRouteCard({ route }: { route: UserRoute }) {
  return <View className="route-card" onClick={() => Taro.navigateTo({ url: `/pages/routes/detail/index?id=${route.id}` })}>
    {route.images[0] ? <Image className="route-card__cover" mode="aspectFill" src={route.images[0]} /> : <View className="route-card__cover route-card__cover--placeholder">骑友路线</View>}
    <View className="route-card__body"><Text className="route-card__title">{route.title}</Text><Text className="route-card__meta">骑友发布 · {route.start_location} → {route.end_location || "未设置终点"}{route.region_match === "through" ? " · 途经本地" : ""}</Text><Text className="route-card__summary">{route.description || `由 ${route.creator.nickname} 录入`}</Text><View className="route-card__facts"><Text>{route.total_distance != null ? `${route.total_distance} km` : "里程待补充"}</Text><Text>{route.estimated_time != null ? `约 ${route.estimated_time} 分钟` : "时长待补充"}</Text><Text className="route-card__favorite">{route.difficulty ? `${route.difficulty} 星` : "难度待补充"}</Text></View></View>
  </View>;
}

export default function RoutesPage() {
  const [items, setItems] = useState<RouteFeedItem[]>([]);
  const [query, setQuery] = useState<RouteListQuery>({ limit: 20 });
  const { selected, hydrate } = useRegionStore();
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [continuation, setContinuation] = useState<RouteFeedCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const generation = useRef(0);
  const morePending = useRef(false);
  const activeFeed = useRef<RouteFeedQuery>();

  const load = useCallback(async (nextQuery: RouteListQuery = query, region: SelectedRegion = useRegionStore.getState().selected, nextSource: SourceFilter = source) => {
    const version = ++generation.current;
    const regionQuery = { city_code: region.city_code, district_code: region.district_code };
    const feed: RouteFeedQuery = {
      source: nextSource, limit: 20,
      official: { ...nextQuery, ...regionQuery },
      user: { keyword: keyword.trim() || undefined, ...regionQuery },
    };
    activeFeed.current = feed;
    morePending.current = false;
    setLoadingMore(false);
    setMoreError(false);
    setContinuation(null);
    setState("loading");
    try {
      const result = await loadRouteFeedPage(feed, feedLoaders);
      if (version !== generation.current) return;
      setItems(result.items);
      setContinuation(result.continuation);
      setState("ready");
      trackRouteEvent("route_list_result", { official_count: result.items.filter((item) => item.source === "official").length, user_count: result.items.filter((item) => item.source === "user").length });
    } catch { if (version === generation.current) setState("error"); }
    finally { if (version === generation.current) Taro.stopPullDownRefresh(); }
  }, [keyword, query, source]);

  const loadMore = async () => {
    if (state !== "ready" || !continuation || !activeFeed.current || morePending.current) return;
    const version = generation.current;
    morePending.current = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const result = await loadRouteFeedPage(activeFeed.current, feedLoaders, continuation);
      if (version !== generation.current) return;
      setItems((previous) => {
        const seen = new Set(previous.map((item) => `${item.source}-${item.route.id}`));
        return [...previous, ...result.items.filter((item) => !seen.has(`${item.source}-${item.route.id}`))];
      });
      setContinuation(result.continuation);
    } catch { if (version === generation.current) setMoreError(true); }
    finally { if (version === generation.current) { morePending.current = false; setLoadingMore(false); } }
  };

  useDidShow(() => { trackRouteEvent("route_module_exposure"); void (async () => { await hydrate(); await load(query, useRegionStore.getState().selected); })(); });
  usePullDownRefresh(() => void load());
  useReachBottom(() => void loadMore());
  const changeFilter = (patch: Partial<RouteListQuery>) => { const next = { ...query, ...patch, cursor: undefined }; setQuery(next); void load(next); };
  const changeSource = (value: SourceFilter) => { setSource(value); void load(query, useRegionStore.getState().selected, value); };
  const total = items.length;

  return <View className="routes-page">
    <View className="routes-page__hero"><View className="routes-page__heading"><View><Text className="routes-page__title">路线</Text><Text className="routes-page__subtitle">官方精选与骑友发布路线统一展示</Text></View><View className="routes-page__region" onClick={() => Taro.navigateTo({ url: "/pages/regions/select/index" })}>{selected.district_name ?? selected.city_name} ⌄</View></View><View className="routes-page__user-actions"><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/mine/index" })}>我的路线</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/create/index" })}>+ 录入路线</Text></View><Input className="routes-page__city" value={keyword} placeholder="搜索骑友路线标题、起点或终点" onInput={(event) => setKeyword(event.detail.value)} onConfirm={() => void load()} /></View>
    <ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">{([['all','全部路线'],['official','官方路线'],['user','骑友路线']] as const).map(([value,label]) => <Text key={value} className={source === value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeSource(value)}>{label}</Text>)}</View></ScrollView>
    {source !== "user" ? <><ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">{types.map((item) => <Text key={item.value ?? "all"} className={query.type === item.value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeFilter({ type: item.value })}>{item.label}</Text>)}</View></ScrollView><ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">{difficulties.map((item) => <Text key={item.value ?? "all"} className={query.difficulty === item.value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeFilter({ difficulty: item.value })}>{item.label}</Text>)}</View></ScrollView></> : null}
    {state === "loading" ? <StatePanel type="loading" title="正在加载路线" /> : null}
    {state === "error" ? <StatePanel type="error" actionText="重新加载" onAction={() => void load()} /> : null}
    {state === "ready" && !total ? <StatePanel type="empty" title="没有匹配路线" description="换个筛选条件试试" /> : null}
    {state === "ready" && total ? <View className="routes-page__list">{items.map((item) => item.source === "official" ? <OfficialRouteCard key={`official-${item.route.id}`} route={item.route} /> : <UserRouteCard key={`user-${item.route.id}`} route={item.route} />)}{continuation ? <View className="routes-page__more" onClick={() => void loadMore()}>{loadingMore ? "正在加载更多" : moreError ? "加载失败，点击重试" : "上拉或点击加载更多"}</View> : <View className="routes-page__end">已展示当前全部路线</View>}</View> : null}
  </View>;
}
