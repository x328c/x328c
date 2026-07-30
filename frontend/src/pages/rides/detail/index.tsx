import { Image, Progress, ScrollView, Text, View } from "@tarojs/components";
import { useCallback, useEffect, useState } from "react";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import { ConfirmDialog, Empty, Skeleton, StatusTag } from "@/components";
import { rideService } from "@/services/rides";
import { useRideInteractionStore } from "@/stores/ride-interaction-store";
import { useUserStore } from "@/stores/user-store";
import type { RideDetail, RideParticipant } from "@/types/api";
import { formatCountdown, formatDateTime } from "@/utils/format";
import "./index.scss";

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src ? <Image className="ride-detail__avatar" src={src} /> : <View className="ride-detail__avatar ride-detail__avatar--placeholder">{name.slice(0, 1)}</View>;
}

export default function RideDetailPage() {
  const [ride, setRide] = useState<RideDetail>();
  const [participants, setParticipants] = useState<RideParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [showJoinConfirm, setShowJoinConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showCannotLeave, setShowCannotLeave] = useState(false);
  const cacheJoined = useRideInteractionStore((state) => state.setJoined);
  const cachedJoined = useRideInteractionStore((state) => state.joinedRideIds);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const detail = await rideService.detail(id);
      setRide(detail);
      const participantResult = await rideService.participants(id);
      setParticipants(participantResult.list);
      const currentUser = useUserStore.getState().user;
      if (currentUser) {
        const isJoined = participantResult.list.some((item) => item.user_id === currentUser.id);
        setJoined(isJoined);
        cacheJoined(id, isJoined);
      } else {
        setJoined(Boolean(cachedJoined[id]));
      }
    }
    catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" }); }
    finally { setLoading(false); }
  }, [cacheJoined, cachedJoined]);

  useLoad((options) => {
    useUserStore.getState().hydrate();
    if (options.id) void load(options.id);
  });
  useEffect(() => { useUserStore.getState().hydrate(); }, []);
  useShareAppMessage(() => ({
    title: ride?.title ?? "约骑详情",
    path: `/pages/rides/detail/index?id=${ride?.id ?? ""}&source=share`,
    imageUrl: ride?.creator.avatar_url ?? "",
  }));

  if (loading) return <View className="ride-detail"><Skeleton /><Skeleton /></View>;
  if (!ride) return <View className="ride-detail"><Empty text="约骑不存在或已被删除" /></View>;

  const canJoin = (ride.status === 1 || ride.status === 2) && !ride.is_full;
  const isCreator = useUserStore.getState().user?.id === ride.creator.id;
  const actionText = joined ? "已报名" : ride.is_full ? "名额已满" : ride.status === 1 || ride.status === 2 ? "立即报名" : ride.status === 3 ? "约骑进行中" : ride.status === 4 ? "约骑已结束" : "约骑已取消";
  const percentage = Math.min(100, Math.round((ride.join_count / ride.max_people) * 100));
  const description = ride.description || "发起人暂未填写约骑说明。";

  const openMap = () => {
    if (!ride.meetup_lat || !ride.meetup_lng) return Taro.showToast({ title: "暂未提供坐标", icon: "none" });
    void Taro.openLocation({ latitude: Number(ride.meetup_lat), longitude: Number(ride.meetup_lng), name: ride.meetup_address, address: ride.meetup_address, scale: 16 });
  };
  const contact = () => {
    const wechat = ride.creator.wechat_id;
    if (!wechat) return Taro.showToast({ title: "发起人暂未公开微信号", icon: "none" });
    void Taro.setClipboardData({ data: wechat });
  };
  const requestReminder = async () => {
    const templateId = __RIDE_REMINDER_TEMPLATE_ID__;
    if (!templateId) return;
    try { await Taro.requestSubscribeMessage({ tmplIds: [templateId], entityIds: [] }); } catch { /* 用户可跳过订阅 */ }
  };
  const join = async () => {
    if (!canJoin || joining) return;
    setJoining(true);
    try {
      await rideService.join(ride.id);
      setJoined(true); cacheJoined(ride.id, true); setShowJoinConfirm(false);
      Taro.showToast({ title: "报名成功！", icon: "success" });
      await requestReminder(); await load(ride.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "报名失败";
      Taro.showToast({ title: message.includes("满") ? "手慢了，名额已满" : message, icon: "none" });
    }
    finally { setJoining(false); }
  };
  const requestLeave = () => {
    setShowActions(false);
    if (new Date(ride.departure_time).getTime() - Date.now() < 2 * 60 * 60 * 1000) {
      setShowCannotLeave(true); return;
    }
    setShowLeaveConfirm(true);
  };
  const leave = async () => {
    setJoining(true);
    try {
      await rideService.leave(ride.id);
      setJoined(false); cacheJoined(ride.id, false); setShowLeaveConfirm(false);
      Taro.showToast({ title: "已取消报名", icon: "success" }); await load(ride.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "取消报名失败";
      if (message.includes("2小时")) setShowCannotLeave(true);
      else Taro.showToast({ title: message, icon: "none" });
    } finally { setJoining(false); }
  };
  const primaryAction = () => {
    if (joined) {
      if (isCreator) {
        Taro.showToast({ title: "您是发起人，已自动报名", icon: "none" });
        return;
      }
      setShowActions(true);
      return;
    }
    if (canJoin) setShowJoinConfirm(true);
  };

  return <View className="ride-detail">
    {ride.status === 0 && <View className="ride-detail__cancelled">该约骑已被发起人取消</View>}
    <View className="ride-detail__title-row"><Text className="ride-detail__title">{ride.title}</Text><StatusTag status={ride.status} full={ride.is_full} /></View>
    <View className="ride-detail__creator" onClick={() => Taro.navigateTo({ url: `/pages/users/profile/index?id=${ride.creator.id}` })}>
      <Avatar src={ride.creator.avatar_url} name={ride.creator.nickname} />
      <View><Text className="ride-detail__name">{ride.creator.nickname}</Text><Text className="ride-detail__creator-meta">{ride.creator.motorcycle_model || "车型待补充"} · 骑行{ride.creator.riding_years ?? "-"}年</Text></View>
      <Text className="ride-detail__chevron">›</Text>
    </View>

    <View className="ride-detail__card">
      <View className="ride-detail__item"><Text className="ride-detail__icon">⏰</Text><View><Text className="ride-detail__item-label">出发时间</Text><Text className="ride-detail__item-value">{formatDateTime(ride.departure_time)} · {formatCountdown(ride.departure_time)}出发</Text></View></View>
      <View className="ride-detail__item" onClick={openMap}><Text className="ride-detail__icon">⌖</Text><View className="ride-detail__map-copy"><Text className="ride-detail__item-label">集合地点</Text><Text className="ride-detail__item-value">{ride.meetup_address}</Text></View><View className="ride-detail__map">查看地图</View></View>
      <View className="ride-detail__item"><Text className="ride-detail__icon">⌁</Text><View><Text className="ride-detail__item-label">目的地 / 路线</Text><Text className="ride-detail__item-value">{ride.destination || "待发起人补充"}</Text></View></View>
      <View className="ride-detail__people"><View className="ride-detail__people-title"><Text>报名进度</Text><Text>{ride.join_count}人 / 最多{ride.max_people}人</Text></View><Progress percent={percentage} strokeWidth={8} activeColor="#1f7a4d" backgroundColor="#e5ece7" /></View>
    </View>

    <View className="ride-detail__section"><View className="ride-detail__section-title"><Text>已报名（{ride.join_count}人）</Text><Text onClick={() => Taro.navigateTo({ url: `/pages/rides/participants/index?id=${ride.id}` })}>查看全部 ›</Text></View><ScrollView scrollX className="ride-detail__avatars"><View className="ride-detail__avatars-inner">{participants.length ? participants.slice(0, 8).map((participant) => <View key={participant.user_id} className="ride-detail__participant-wrap">{participant.avatar_url ? <Image className="ride-detail__participant" src={participant.avatar_url} /> : <View className="ride-detail__participant ride-detail__participant--placeholder">{participant.nickname.slice(0, 1)}</View>}{participant.is_creator && <Text className="ride-detail__creator-badge">发起人</Text>}</View>) : <Text className="ride-detail__no-participant">暂时还没有人报名</Text>}</View></ScrollView></View>
    <View className="ride-detail__section"><Text className="ride-detail__section-heading">约骑说明</Text><Text className={expanded ? "ride-detail__description ride-detail__description--expanded" : "ride-detail__description"}>{description}</Text>{description.length > 54 && <Text className="ride-detail__expand" onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "展开"}</Text>}</View>
    <View className="ride-detail__safety">安全提示：请遵守交通法规，佩戴头盔与护具，量力而行。</View>
    <View className="ride-detail__bottom"><View className="ride-detail__contact" onClick={contact}>联系发起人</View><View className={canJoin || joined ? "ride-detail__join" : "ride-detail__join ride-detail__join--disabled"} onClick={primaryAction}>{joining ? "处理中…" : actionText}</View></View>
    <ConfirmDialog visible={showJoinConfirm} title="确认报名" content={`报名“${ride.title}”后请按时到达并遵守安全规则。`} onCancel={() => setShowJoinConfirm(false)} onConfirm={() => void join()} />
    <ConfirmDialog visible={showLeaveConfirm} title="确认取消报名" content="取消后将释放名额给其他骑友，确定要取消吗？" onCancel={() => setShowLeaveConfirm(false)} onConfirm={() => void leave()} />
    {showActions && <View className="ride-detail__sheet"><View className="ride-detail__sheet-mask" onClick={() => setShowActions(false)} /><View className="ride-detail__sheet-panel"><Text className="ride-detail__sheet-title">已报名</Text><Text className="ride-detail__sheet-action" onClick={requestLeave}>取消报名</Text><Text className="ride-detail__sheet-action" onClick={() => setShowActions(false)}>查看详情</Text><Text className="ride-detail__sheet-cancel" onClick={() => setShowActions(false)}>取消</Text></View></View>}
    {showCannotLeave && <View className="ride-detail__sheet"><View className="ride-detail__sheet-mask" onClick={() => setShowCannotLeave(false)} /><View className="ride-detail__sheet-panel"><Text className="ride-detail__sheet-title">暂时无法取消</Text><Text className="ride-detail__sheet-message">距离出发不足2小时，无法取消报名，请联系发起人说明情况</Text><Text className="ride-detail__sheet-action" onClick={() => { setShowCannotLeave(false); contact(); }}>联系发起人</Text><Text className="ride-detail__sheet-cancel" onClick={() => setShowCannotLeave(false)}>知道了</Text></View></View>}
  </View>;
}
