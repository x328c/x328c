import { Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { useRef, useState } from "react";
import { Empty, RideCard, RideFilterSheet, Skeleton } from "@/components";
import { DEFAULT_RIDE_FILTERS, type RideFilters } from "@/components/RideFilterSheet";
import { rideService } from "@/services/rides";
import { useRideListStore } from "@/stores/ride-store";
import { useRegionStore, type SelectedRegion } from "@/stores/region-store";
import "./index.scss";

const PAGE_SIZE = 20;

export default function Index() {
  const { rides, pagination, loading, replace, append, setLoading } = useRideListStore();
  const [filters, setFilters] = useState<RideFilters>(DEFAULT_RIDE_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);
  const { selected, hydrate } = useRegionStore();
  const currentLocation = useRef<{ latitude: number; longitude: number }>();
  const locationAttempted = useRef(false);

  const timeRange = (value: RideFilters) => {
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (value.time === "all") return {};
    if (value.time === "tomorrow") start.setDate(start.getDate() + 1);
    const end = new Date(start); end.setDate(end.getDate() + (value.time === "week" ? 7 : 1));
    return { start_time: start.toISOString(), end_time: end.toISOString() };
  };

  const locate = async (required = false): Promise<typeof currentLocation.current> => {
    if (currentLocation.current) return currentLocation.current;
    if (locationAttempted.current && !required) return undefined;
    locationAttempted.current = true;
    try {
      const result = await Taro.getLocation({
        type: "gcj02",
        isHighAccuracy: true,
        highAccuracyExpireTime: 5000,
      });
      currentLocation.current = { latitude: result.latitude, longitude: result.longitude };
      return currentLocation.current;
    } catch {
      if (!required) return undefined;
      const modal = await Taro.showModal({
        title: "需要位置权限",
        content: "距离筛选需要获取当前位置，用于计算您与同行集合地点的距离。",
        confirmText: "去设置",
      });
      if (!modal.confirm) return undefined;
      await Taro.openSetting();
      locationAttempted.current = false;
      return locate(false);
    }
  };

  const loadRides = async (
    page = 1,
    refresh = false,
    nextFilters = filters,
    location?: typeof currentLocation.current,
    region: SelectedRegion = useRegionStore.getState().selected,
  ) => {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const resolvedLocation = location ?? await locate(false);
      const data = await rideService.list({
        page,
        pageSize: PAGE_SIZE,
        city_code: region.city_code,
        district_code: region.district_code,
        radius: nextFilters.radius,
        ride_style: nextFilters.ride_style,
        latitude: resolvedLocation?.latitude,
        longitude: resolvedLocation?.longitude,
        ...timeRange(nextFilters),
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

  useDidShow(() => { void (async () => { await hydrate(); await loadRides(1, true, filters, undefined, useRegionStore.getState().selected); })(); });

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
        <View className="ride-square__city" onClick={() => Taro.navigateTo({ url: "/pages/regions/select/index" })}>
          <Text className="ride-square__pin">⌖</Text>
          <Text>{selected.district_name ?? selected.city_name}</Text>
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
      <RideFilterSheet visible={filterVisible} value={filters} onClose={() => setFilterVisible(false)} onConfirm={(value) => { void (async () => { const location = value.radius === undefined ? await locate(false) : await locate(true); if (value.radius !== undefined && !location) return; setFilters(value); setFilterVisible(false); await loadRides(1, true, value, location); })(); }} />
    </View>
  );
}
