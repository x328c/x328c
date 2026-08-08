import { Image, Map, Text, View } from "@tarojs/components";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { trackRouteEvent } from "@/services/analytics";
import { ApiError } from "@/services/request";
import { routeService } from "@/services/routes";
import { useUserStore } from "@/stores/user-store";
import type { RideSummary, RouteDetail } from "@/types/api";
import { openLogin } from "@/utils/login-return";
import "./index.scss";

const difficultyNames = { easy: "轻松", moderate: "适中", hard: "挑战" } as const;
const pointTypeNames = { start: "起点", waypoint: "途经", end: "终点" } as const;

export default function RouteDetailPage() {
  const [route, setRoute] = useState<RouteDetail>();
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "disabled" | "offline">("loading");
  const [routeId, setRouteId] = useState("");
  const [mapFailed, setMapFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (id: string) => {
    setState("loading");
    try {
      const detail = await routeService.detail(id);
      setRoute(detail); setState("ready");
      trackRouteEvent("route_detail_view", { route_id: id });
      const related = await routeService.relatedRides(id).catch(() => ({ items: [] }));
      setRides(related.items);
    } catch (error) {
      if (error instanceof ApiError && error.code === 52001) setState("disabled");
      else if (error instanceof ApiError && (error.code === 53004 || error.status === 410)) setState("offline");
      else setState("error");
    }
  };

  useLoad((options) => {
    useUserStore.getState().hydrate();
    if (options.id) { setRouteId(options.id); void load(options.id); } else setState("error");
  });

  useShareAppMessage(() => ({
    title: route?.title ?? "摩搭子精选路线",
    path: `/packageRoutes/pages/detail/index?id=${route?.id ?? routeId}`,
    imageUrl: route?.cover_image ?? "",
  }));

  const toggleFavorite = async () => {
    if (!route || saving) return;
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) {
      await openLogin(`/packageRoutes/pages/detail/index?id=${route.id}`);
      return;
    }
    setSaving(true);
    try {
      const result = route.is_favorited ? await routeService.unfavorite(route.id) : await routeService.favorite(route.id);
      setRoute({ ...route, is_favorited: result.favorited, favorite_count: result.favorite_count });
      trackRouteEvent("route_favorite", { route_id: route.id, favorited: result.favorited });
      Taro.showToast({ title: result.favorited ? "已收藏" : "已取消收藏", icon: "success" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" });
    } finally { setSaving(false); }
  };

  if (state === "loading") return <View className="route-detail"><StatePanel type="loading" title="正在加载路线" /></View>;
  if (state === "disabled") return <View className="route-detail"><StatePanel type="disabled" title="路线功能暂未开放" description="约骑功能仍可正常使用" actionText="返回约骑" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /></View>;
  if (state === "offline") return <View className="route-detail"><StatePanel type="offline" title="该路线已下架" description="路线信息可能已发生变化，请浏览其他精选路线" actionText="返回路线列表" onAction={() => Taro.switchTab({ url: "/pages/routes/index" })} /></View>;
  if (state === "error" || !route) return <View className="route-detail"><StatePanel type="error" title="路线加载失败" actionText="重新加载" onAction={() => void load(routeId)} /></View>;

  const center = route.polyline[0] ?? (route.points[0] ? { latitude: Number(route.points[0].latitude), longitude: Number(route.points[0].longitude) } : undefined);
  const canShowMap = Boolean(center && route.polyline.length >= 2 && !mapFailed);

  return <View className="route-detail">
    {route.cover_image ? <Image className="route-detail__cover" mode="aspectFill" src={route.cover_image} /> : null}
    <View className="route-detail__header">
      <Text className="route-detail__title">{route.title}</Text>
      <Text className="route-detail__meta">{route.city_name || route.city_code} · {route.difficulty ? difficultyNames[route.difficulty] : "难度待补充"}</Text>
      <View className="route-detail__facts"><Text>{route.distance_km} km</Text><Text>约 {route.duration_min} 分钟</Text><Text>{route.favorite_count} 人收藏</Text></View>
    </View>
    <View className="route-detail__section">
      <Text className="route-detail__heading">地图与点位</Text>
      {canShowMap && center ? <Map className="route-detail__map" latitude={center.latitude} longitude={center.longitude} scale={10} polyline={[{ points: route.polyline, color: "#FF6A00", width: 5 }]} markers={route.points.map((point) => ({ id: Number(point.order + 1), latitude: Number(point.latitude), longitude: Number(point.longitude), title: point.name, iconPath: "/assets/tabbar/route-selected.png", width: 24, height: 24 }))} onError={() => setMapFailed(true)} /> : <View className="route-detail__map-fallback">地图暂不可用，以下文字点位仍可正常查看</View>}
      <View className="route-detail__points">{route.points.map((point) => <View key={point.id} className="route-detail__point"><Text className="route-detail__point-order">{point.order + 1}</Text><View><Text className="route-detail__point-name">{point.name}</Text><Text className="route-detail__point-meta">{pointTypeNames[point.type]}{point.description ? ` · ${point.description}` : ""}</Text></View></View>)}</View>
    </View>
    <View className="route-detail__section"><Text className="route-detail__heading">路线说明</Text><Text className="route-detail__copy">{route.summary || "暂无路线简介"}</Text><Text className="route-detail__label">路况</Text><Text className="route-detail__copy">{route.road_condition || "暂无"}</Text><Text className="route-detail__label">适合车型 / 季节</Text><Text className="route-detail__copy">{route.suitable_motorcycles || "不限"} · {route.best_season || "请根据实时天气判断"}</Text></View>
    <View className="route-detail__safety"><Text className="route-detail__heading">安全提示</Text><Text>{route.safety_notice}</Text></View>
    <View className="route-detail__section"><Text className="route-detail__heading">相关约骑</Text>{rides.length ? rides.map((ride) => <View key={ride.id} className="route-detail__ride" onClick={() => { trackRouteEvent("route_related_rides_click", { route_id: route.id, ride_id: ride.id }); void Taro.navigateTo({ url: `/pages/rides/detail/index?id=${ride.id}` }); }}><View><Text className="route-detail__ride-title">{ride.title}</Text><Text className="route-detail__ride-meta">{new Date(ride.departure_time).toLocaleString()} · {ride.join_count}/{ride.max_people} 人</Text></View><Text>›</Text></View>) : <Text className="route-detail__copy">当前暂无有效相关约骑</Text>}</View>
    <Text className="route-detail__updated">信息更新于 {new Date(route.updated_at).toLocaleDateString()}，出发前请复核天气和道路状况。</Text>
    <View className="route-detail__bottom"><View className="route-detail__favorite" onClick={() => void toggleFavorite()}>{saving ? "处理中…" : route.is_favorited ? "★ 已收藏" : "☆ 收藏"}</View><View className="route-detail__primary" onClick={() => { const first = rides[0]; if (!first) { Taro.showToast({ title: "当前暂无相关约骑", icon: "none" }); return; } trackRouteEvent("route_related_rides_click", { route_id: route.id, ride_id: first.id }); void Taro.navigateTo({ url: `/pages/rides/detail/index?id=${first.id}` }); }}>查看相关约骑</View></View>
  </View>;
}
