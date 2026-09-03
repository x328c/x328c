import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { Empty, RideCard, Skeleton } from '@/components';
import { rideService } from '@/services/rides';
import type { RideSummary } from '@/types/api';
import './index.scss';

export default function MyRides() {
  const [type, setType] = useState<'created' | 'joined'>('created');
  const [items, setItems] = useState<RideSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async (nextType = type) => {
    setLoading(true);
    try { setItems((await rideService.mine(nextType)).list); } catch { /* 页面保留空态 */ }
    finally { setLoading(false); }
  };
  useDidShow(() => void load());
  const historical = (ride: RideSummary) => ![1, 2].includes(ride.status) || new Date(ride.departure_time).getTime() <= Date.now();

  return <View className="my-list">
    <View className="my-list__tabs"><Text className={type === 'created' ? 'my-list__on' : ''} onClick={() => { setType('created'); void load('created'); }}>我发起的</Text><Text className={type === 'joined' ? 'my-list__on' : ''} onClick={() => { setType('joined'); void load('joined'); }}>我报名的</Text></View>
    {loading ? <Skeleton /> : items.length ? items.map((ride) => <View key={ride.id} className="my-list__ride"><RideCard ride={ride} onClick={() => Taro.navigateTo({ url: `/pages/rides/detail/index?id=${ride.id}` })} />{historical(ride) ? <View className="my-list__relaunch" onClick={() => Taro.navigateTo({ url: `/pages/rides/create/index?relaunchId=${ride.id}` })}>再次发起同行</View> : null}</View>) : <Empty text="暂无同行" />}
  </View>;
}
