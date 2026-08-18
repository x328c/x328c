import { Text, View } from "@tarojs/components";
import Taro, { useLoad, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { useState } from "react";
import { Empty, RideCard, RideFilterSheet, Skeleton } from "@/components";
import { DEFAULT_RIDE_FILTERS, type RideFilters } from "@/components/RideFilterSheet";
import { rideService } from "@/services/rides";
import { useRideListStore } from "@/stores/ride-store";
import "./index.scss";

const CITY = { name: "乌鲁木齐", code: "650100" };
const PAGE_SIZE = 20;

export default function Index() {
  const { rides, pagination, loading, replace, append, setLoading } = useRideListStore();
  const [filters, setFilters] = useState<RideFilters>(DEFAULT_RIDE_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);

  const timeRange = () => {
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (filters.time === "all") return {};
    if (filters.time === "tomorrow") start.setDate(start.getDate() + 1);
    const end = new Date(start); end.setDate(end.getDate() + (filters.time === "week" ? 7 : 1));
    return { start_time: start.toISOString(), end_time: end.toISOString() };
  };

  const loadRides = async (page = 1, refresh = false) => {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const data = await rideService.list({
        page,
        pageSize: PAGE_SIZE,
        city_code: CITY.code,
        radius: filters.radius,
        ride_style: filters.ride_style,
        ...timeRange(),
      });
      if (page === 1) replace(data.list, data.pagination);
      else append(data.list, data.pagination);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    } finally {
      setLoading(false);
      if (refresh) Taro.stopPullDownRefresh();
    }
  };

  useLoad(() => {
    void loadRides();
  });

  usePullDownRefresh(() => {
    void loadRides(1, true);
  });

  useReachBottom(() => {
    const hasMore = rides.length < pagination.total;
    if (hasMore) void loadRides(pagination.page + 1);
  });

  return (
    <View className="ride-square">
      <View className="ride-square__toolbar">
        <View className="ride-square__city" onClick={() => Taro.showToast({ title: "城市定位即将开放", icon: "none" })}>
          <Text className="ride-square__pin">⌖</Text>
          <Text>{CITY.name}</Text>
          <Text className="ride-square__arrow">⌄</Text>
        </View>
        <View className="ride-square__actions"><View className="ride-square__regulations" onClick={() => Taro.navigateTo({ url: "/packageRegulations/pages/index/index" })}>骑行安全手册</View><View className="ride-square__filter" onClick={() => setFilterVisible(true)}>筛选</View></View>
      </View>

      <View className="ride-square__tabs">
        <View className="ride-square__tab ride-square__tab--active">同行助手</View>
      </View>

      <View className="ride-square__list">
        {loading && rides.length === 0 ? (
          <>
            <Skeleton /><Skeleton /><Skeleton />
          </>
        ) : rides.length ? (
          rides.map((ride) => (
            <RideCard key={ride.id} ride={ride} onClick={() => Taro.navigateTo({ url: `/pages/rides/detail/index?id=${ride.id}` })} />
          ))
        ) : (
          <Empty text="附近暂时没有同行" actionText="刷新试试" onAction={() => void loadRides(1, true)} />
        )}
        {rides.length > 0 && (
          <Text className="ride-square__more">{loading ? "加载中…" : rides.length >= pagination.total ? "没有更多了" : "上拉加载更多"}</Text>
        )}
      </View>

      <View className="ride-square__create" onClick={() => Taro.navigateTo({ url: "/pages/rides/create/index" })}>+</View>
      <RideFilterSheet visible={filterVisible} value={filters} onClose={() => setFilterVisible(false)} onConfirm={(value) => { setFilters(value); setFilterVisible(false); setTimeout(() => void loadRides(1, true), 0); }} />
    </View>
  );
}
