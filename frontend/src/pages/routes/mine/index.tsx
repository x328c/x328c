import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { userRouteService } from "@/services/user-routes";
import type { UserRoute } from "@/types/api";
import "../user-routes.scss";
import "../index.scss";

export default function UserRouteMinePage() {
  const [tab, setTab] = useState<"all" | "1" | "2">("all");
  const [items, setItems] = useState<UserRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async (next = tab) => {
    setLoading(true);
    try {
      const result = await userRouteService.mine({ limit: 50, visibility: next === "all" ? undefined : Number(next) as 1 | 2 });
      setItems(result.items);
    } finally { setLoading(false); }
  };
  useDidShow(() => void load());
  return <View className="user-route-page">
    <View className="user-route-actions"><View className="user-route-action user-route-action--primary" onClick={() => Taro.navigateTo({ url: "/pages/routes/create/index" })}>+ 录入路线</View><View className="user-route-action" onClick={() => Taro.switchTab({ url: "/pages/routes/index" })}>全部路线</View></View>
    <View className="user-route-tabs">{[["all","全部"],["1","仅自己可见"],["2","发布平台"]].map(([value,label]) => <Text key={value} className={tab === value ? "user-route-tab user-route-tab--active" : "user-route-tab"} onClick={() => { const next = value as typeof tab; setTab(next); void load(next); }}>{label}</Text>)}</View>
    {loading ? <StatePanel type="loading" title="正在加载路线" /> : !items.length ? <StatePanel type="empty" title="暂无路线" /> : <View className="routes-page__list user-route-list">{items.map((route) => <View key={route.id} className="route-card" onClick={() => Taro.navigateTo({ url: `/pages/routes/detail/index?id=${route.id}` })}>{route.images[0] ? <Image className="route-card__cover" src={route.images[0]} mode="aspectFill" /> : <View className="route-card__cover route-card__cover--placeholder">用户路线</View>}<View className="route-card__body"><Text className="route-card__title">{route.title}</Text><Text className="route-card__meta">{route.start_location} → {route.end_location || "未设置终点"}</Text><Text className="route-card__summary">{route.description || "骑友录入路线"}</Text><View className="route-card__facts"><Text>{route.total_distance != null ? `${route.total_distance} km` : "里程待补充"}</Text><Text>{route.estimated_time != null ? `约 ${route.estimated_time} 分钟` : "时长待补充"}</Text><Text className="route-card__favorite">{route.visibility === 1 ? "私密" : "公开"}</Text></View></View></View>)}</View>}
  </View>;
}
