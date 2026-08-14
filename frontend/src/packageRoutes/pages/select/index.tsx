import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { routeService } from "@/services/routes";
import type { RouteSummary } from "@/types/api";
import "./index.scss";

export default function RouteSelectPage() {
  const [items, setItems] = useState<RouteSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useLoad(() => { void routeService.list({ limit: 50 }).then((result) => { setItems(result.items); setState("ready"); }).catch(() => setState("error")); });
  const select = (route: RouteSummary) => {
    Taro.setStorageSync("v21:create-route", { id: route.id, title: route.title, city_code: route.city_code, city_name: route.city_name, difficulty: route.difficulty, distance_km: route.distance_km, available: true });
    void Taro.navigateBack();
  };
  if (state === "loading") return <StatePanel type="loading" title="正在加载官方路线" />;
  if (state === "error") return <StatePanel type="error" title="路线加载失败" actionText="返回" onAction={() => Taro.navigateBack()} />;
  return <View className="route-select"><Text className="route-select__hint">选择后将预填路线与起终点，仍需确认时间和集合地点。</Text>{items.map((route) => <View className="route-select__item" key={route.id} onClick={() => select(route)}><Text className="route-select__title">{route.title}</Text><Text>{route.city_name || route.city_code} · {route.difficulty || "难度待补充"} · {route.distance_km || "-"} km</Text></View>)}</View>;
}
