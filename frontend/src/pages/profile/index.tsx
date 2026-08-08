import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { logout } from "@/services/auth";
import { userService } from "@/services/users";
import type { UserProfile } from "@/types/api";
import "./index.scss";

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile>();
  useDidShow(() => void userService.profile().then(setProfile).catch(() => undefined));
  const data = profile?.profile;
  const handleLogout = async () => {
    const result = await Taro.showModal({
      title: "确认退出登录",
      content: "退出后将不再显示当前账号的个人资料和消息。",
      confirmText: "退出登录",
      confirmColor: "#C74700",
    });
    if (!result.confirm) return;
    await logout();
    await Taro.reLaunch({ url: "/pages/auth/index" });
  };
  return <View className="profile">
    <View className="profile__hero">
      <View className="profile__avatar">{profile?.avatar_url ? <Image src={profile.avatar_url} /> : <Text>{profile?.nickname?.slice(0, 1) || "骑"}</Text>}</View>
      <View className="profile__info"><Text>{profile?.nickname || "微信用户"}</Text><Text>{data?.motorcycle_model || "完善资料，找到同频骑友"}</Text><Text>{data?.bio || "暂无简介"}</Text></View>
      <Text className="profile__edit" onClick={() => Taro.navigateTo({ url: "/pages/profile/edit/index" })}>编辑资料</Text>
    </View>
    <View className="profile__stats"><Text>发布约骑</Text><Text>参加活动</Text></View>
    <View className="profile__menu"><Text onClick={() => Taro.navigateTo({ url: "/packageRegulations/pages/index/index" })}>法规检索 ›</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/my/rides/index" })}>我的约骑 ›</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/my/activities/index" })}>我的活动 ›</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}>设置 ›</Text></View>
    <View className="profile__logout" onClick={() => void handleLogout()}>退出登录</View>
  </View>;
}
