import { Image, Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { StatePanel } from "@/components";
import { trackRouteEvent } from "@/services/analytics";
import { routeService, type RouteListQuery } from "@/services/routes";
import { userRouteService } from "@/services/user-routes";
import type { RouteDifficulty, RouteSummary, RouteType, UserRoute } from "@/types/api";
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
type SourceFilter = "all" | "official" | "user";

function OfficialRouteCard({ route }: { route: RouteSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <View className="route-card" onClick={() => Taro.navigateTo({ url: `/packageRoutes/pages/detail/index?id=${route.id}` })}>
    {route.cover_image && !imageFailed ? <Image className="route-card__cover" mode="aspectFill" src={route.cover_image} onError={() => setImageFailed(true)} /> : <View className="route-card__cover route-card__cover--placeholder">官方路线</View>}
    <View className="route-card__body"><Text className="route-card__title">{route.title}</Text><Text className="route-card__meta">官方精选 · {route.city_name || route.city_code || "城市待补充"} · {route.difficulty ? difficultyNames[route.difficulty] : "难度待补充"}</Text><Text className="route-card__summary">{route.summary || "运营精选骑行路线"}</Text><View className="route-card__facts"><Text>{route.distance_km ? `${route.distance_km} km` : "里程待补充"}</Text><Text>{route.duration_min ? `约 ${Math.ceil(route.duration_min / 60)} 小时` : "时长待补充"}</Text></View></View>
  </View>;
}

function UserRouteCard({ route }: { route: UserRoute }) {
  return <View className="route-card" onClick={() => Taro.navigateTo({ url: `/pages/routes/detail/index?id=${route.id}` })}>
    {route.images[0] ? <Image className="route-card__cover" mode="aspectFill" src={route.images[0]} /> : <View className="route-card__cover route-card__cover--placeholder">骑友路线</View>}
    <View className="route-card__body"><Text className="route-card__title">{route.title}</Text><Text className="route-card__meta">骑友发布 · {route.start_location} → {route.end_location || "未设置终点"}</Text><Text className="route-card__summary">{route.description || `由 ${route.creator.nickname} 录入`}</Text><View className="route-card__facts"><Text>{route.total_distance != null ? `${route.total_distance} km` : "里程待补充"}</Text><Text>{route.estimated_time != null ? `约 ${route.estimated_time} 分钟` : "时长待补充"}</Text><Text className="route-card__favorite">{route.difficulty ? `${route.difficulty} 星` : "难度待补充"}</Text></View></View>
  </View>;
}

export default function RoutesPage() {
  const [official, setOfficial] = useState<RouteSummary[]>([]);
  const [userRoutes, setUserRoutes] = useState<UserRoute[]>([]);
  const [query, setQuery] = useState<RouteListQuery>({ limit: 50 });
  const [cityCode, setCityCode] = useState("");
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (nextQuery: RouteListQuery = query) => {
    setState("loading");
    try {
      const [officialResult, userResult] = await Promise.all([
        routeService.list(nextQuery),
        userRouteService.publicList({ limit: 50, keyword: keyword.trim() || undefined }),
      ]);
      setOfficial(officialResult.items);
      setUserRoutes(userResult.items);
      setState("ready");
      trackRouteEvent("route_list_result", { official_count: officialResult.items.length, user_count: userResult.items.length });
    } catch { setState("error"); }
    finally { Taro.stopPullDownRefresh(); }
  }, [keyword, query]);

  useDidShow(() => { trackRouteEvent("route_module_exposure"); void load(); });
  usePullDownRefresh(() => void load());
  const changeFilter = (patch: Partial<RouteListQuery>) => { const next = { ...query, ...patch, cursor: undefined }; setQuery(next); void load(next); };
  const shownOfficial = source !== "user" ? official : [];
  const shownUsers = source !== "official" ? userRoutes : [];
  const total = shownOfficial.length + shownUsers.length;

  return <View className="routes-page">
    <View className="routes-page__hero"><Text className="routes-page__title">路线</Text><Text className="routes-page__subtitle">官方精选与骑友发布路线统一展示</Text><View className="routes-page__user-actions"><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/mine/index" })}>我的路线</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/routes/create/index" })}>+ 录入路线</Text></View><Input className="routes-page__city" value={keyword} placeholder="搜索骑友路线标题、起点或终点" onInput={(event) => setKeyword(event.detail.value)} onConfirm={() => void load()} /><Input className="routes-page__city" value={cityCode} maxlength={20} placeholder="官方路线城市码，例如 650100" onInput={(event) => setCityCode(event.detail.value)} onConfirm={() => changeFilter({ city_code: cityCode.trim() || undefined })} /></View>
    <ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">{([['all','全部路线'],['official','官方路线'],['user','骑友路线']] as const).map(([value,label]) => <Text key={value} className={source === value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => setSource(value)}>{label}</Text>)}</View></ScrollView>
    {source !== "user" ? <><ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">{types.map((item) => <Text key={item.value ?? "all"} className={query.type === item.value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeFilter({ type: item.value })}>{item.label}</Text>)}</View></ScrollView><ScrollView scrollX className="routes-page__filters"><View className="routes-page__filter-row">{difficulties.map((item) => <Text key={item.value ?? "all"} className={query.difficulty === item.value ? "routes-page__chip routes-page__chip--active" : "routes-page__chip"} onClick={() => changeFilter({ difficulty: item.value })}>{item.label}</Text>)}</View></ScrollView></> : null}
    {state === "loading" ? <StatePanel type="loading" title="正在加载路线" /> : null}
    {state === "error" ? <StatePanel type="error" actionText="重新加载" onAction={() => void load()} /> : null}
    {state === "ready" && !total ? <StatePanel type="empty" title="没有匹配路线" description="换个筛选条件试试" /> : null}
    {state === "ready" && total ? <View className="routes-page__list">{shownOfficial.map((route) => <OfficialRouteCard key={`official-${route.id}`} route={route} />)}{shownUsers.map((route) => <UserRouteCard key={`user-${route.id}`} route={route} />)}<View className="routes-page__end">已展示当前全部路线</View></View> : null}
  </View>;
}
