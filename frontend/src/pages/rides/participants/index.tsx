import { Image, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { ConfirmDialog, Empty, Skeleton } from "@/components";
import { rideService } from "@/services/rides";
import { useUserStore } from "@/stores/user-store";
import type { RideParticipant } from "@/types/api";
import "./index.scss";

export default function ParticipantsPage() {
  const [rideId, setRideId] = useState("");
  const [items, setItems] = useState<RideParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorId, setCreatorId] = useState("");
  const [target, setTarget] = useState<RideParticipant>();
  const currentUser = useUserStore((state) => state.user);
  const isCreator = currentUser?.id === creatorId;

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [participants, ride] = await Promise.all([rideService.participants(id), rideService.detail(id)]);
      setItems(participants.list);
      setCreatorId(ride.creator.id);
      Taro.setNavigationBarTitle({ title: `报名人员（${participants.pagination.total}人）` });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    } finally { setLoading(false); }
  }, []);

  useLoad((options) => {
    useUserStore.getState().hydrate();
    if (options.id) { setRideId(options.id); void load(options.id); }
  });

  const remove = async () => {
    if (!target) return;
    try {
      await rideService.removeParticipant(rideId, target.user_id);
      setTarget(undefined);
      Taro.showToast({ title: "已移除", icon: "success" });
      await load(rideId);
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "移除失败", icon: "none" }); }
  };

  if (loading) return <View className="participants"><Skeleton /><Skeleton /></View>;
  return <View className="participants">
    {items.length ? items.map((item) => <View key={item.user_id} className="participants__item">
      {item.avatar_url ? <Image className="participants__avatar" src={item.avatar_url} /> : <View className="participants__avatar" />}
      <View className="participants__body"><Text>{item.nickname}</Text><Text>{item.motorcycle_model || "车型待补充"}</Text></View>
      {isCreator && item.user_id !== creatorId && <Text className="participants__remove" onClick={() => setTarget(item)}>移除</Text>}
    </View>) : <Empty text="暂无人报名" />}
    <ConfirmDialog visible={Boolean(target)} title="移除报名人员" content={`确定移除${target?.nickname || "该用户"}吗？`} onCancel={() => setTarget(undefined)} onConfirm={() => void remove()} />
  </View>;
}
