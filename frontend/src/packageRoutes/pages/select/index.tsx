import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { routeService } from "@/services/routes";
import { userRouteService } from "@/services/user-routes";
import type { RouteSummary, UserRoute } from "@/types/api";
import { useRegionStore } from "@/stores/region-store";
import "./index.scss";

type SelectableRoute =
  | { source_type: "official"; route: RouteSummary }
  | { source_type: "user"; route: UserRoute };

export default function RouteSelectPage() {
  const [official, setOfficial] = useState<RouteSummary[]>([]);
  const [mine, setMine] = useState<UserRoute[]>([]);
  const [publicRoutes, setPublicRoutes] = useState<UserRoute[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useLoad(() => {
    const region = useRegionStore.getState().selected;
    void Promise.all([
      routeService.list({ limit: 50, city_code: region.city_code, district_code: region.district_code }),
      userRouteService.mine({ limit: 50 }),
      userRouteService.publicList({ limit: 50, city_code: region.city_code, district_code: region.district_code }),
    ]).then(([officialResult, mineResult, publicResult]) => {
      setOfficial(officialResult.items);
      setMine(mineResult.items);
      const ownIds = new Set(mineResult.items.map((item) => item.id));
      setPublicRoutes(publicResult.items.filter((item) => !ownIds.has(item.id)));
      setState("ready");
    }).catch(() => setState("error"));
  });

  const select = (item: SelectableRoute) => {
    Taro.setStorageSync("v22:create-route", { id: item.route.id, source_type: item.source_type, title: item.route.title });
    void Taro.navigateBack();
  };

  const section = (title: string, items: SelectableRoute[]) => items.length ? <View>
    <Text className="route-select__section-title">{title}</Text>
    {items.map((item) => <View className="route-select__item" key={`${item.source_type}-${item.route.id}`} onClick={() => select(item)}>
      <Text className="route-select__title">{item.route.title}</Text>
      <Text>{item.source_type === "official"
        ? `${item.route.city_name || item.route.city_code || "城市待补充"} · ${item.route.difficulty || "难度待补充"} · ${item.route.distance_km || "-"} km`
        : `${item.route.start_location} → ${item.route.end_location || "未设置终点"} · ${item.route.visibility === 1 ? "仅自己可见" : "骑友发布"}`}</Text>
    </View>)}
  </View> : null;

  if (state === "loading") return <StatePanel type="loading" title="正在加载可关联路线" />;
  if (state === "error") return <StatePanel type="error" title="路线加载失败" actionText="返回" onAction={() => Taro.navigateBack()} />;
  return <View className="route-select">
    <Text className="route-select__hint">可选择自己的录入路线、骑友公开路线或官方路线，选择后会预填起终点。</Text>
    {section("我的录入路线", mine.map((route) => ({ source_type: "user", route })))}
    {section("骑友发布路线", publicRoutes.map((route) => ({ source_type: "user", route })))}
    {section("官方精选路线", official.map((route) => ({ source_type: "official", route })))}
    {!mine.length && !publicRoutes.length && !official.length ? <StatePanel type="empty" title="暂无可关联路线" /> : null}
  </View>;
}
