import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { Empty, Skeleton } from "@/components";
import { notificationService } from "@/services/notifications";
import { useNotificationStore } from "@/stores/notification-store";
import type { NotificationItem } from "@/types/api";
import { formatRelativeTime } from "@/utils/format";
import "./index.scss";

const tabs = [["all", "全部"], ["ride_activity", "同行活动"], ["system", "系统"]] as const;
export default function Messages() {
  const [tab, setTab] = useState<typeof tabs[number][0]>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const setUnread = useNotificationStore((state) => state.setUnreadCount);
  const load = async (category = tab) => {
    setLoading(true);
    try {
      const [data, count] = await Promise.all([notificationService.list(category), notificationService.unreadCount()]);
      setItems(data.list); setUnread(count.count);
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" }); }
    finally { setLoading(false); }
  };
  useDidShow(() => void load());
  const open = async (item: NotificationItem) => {
    if (!item.is_read) {
      await notificationService.read(item.id);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true, unread_dot: false } : entry));
      setUnread(Math.max(0, useNotificationStore.getState().unreadCount - 1));
    }
    if (item.related_id && item.related_type === "ride") void Taro.navigateTo({ url: `/pages/rides/detail/index?id=${item.related_id}` });
  };
  return <View className="messages">
    <View className="messages__head"><Text>助手通知</Text><Text onClick={async () => { await notificationService.readAll(); setItems((current) => current.map((item) => ({ ...item, is_read: true, unread_dot: false }))); setUnread(0); }}>全部已读</Text></View>
    <View className="messages__tabs">{tabs.map(([value, label]) => <Text key={value} className={tab === value ? "messages__on" : ""} onClick={() => { setTab(value); void load(value); }}>{label}</Text>)}</View>
    {loading ? <><Skeleton /><Skeleton /></> : items.length ? items.map((item) => <View key={item.id} className={item.is_read ? "messages__item" : "messages__item messages__item--unread"} onClick={() => void open(item)}><View className="messages__icon">{item.type === 6 ? "◆" : "●"}</View><View className="messages__body"><Text>{item.title}</Text><Text>{item.content}</Text><Text>{formatRelativeTime(item.created_at)}</Text></View>{item.unread_dot ? <View className="messages__dot" /> : null}</View>) : <Empty text="暂时没有助手通知" />}
  </View>;
}
