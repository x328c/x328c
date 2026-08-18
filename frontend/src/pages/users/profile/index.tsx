import { Image, Text, View } from "@tarojs/components";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";
import { Empty } from "@/components";
import { userService } from "@/services/users";
import type { PublicUserProfile } from "@/types/api";
import "./index.scss";

export default function PublicProfile() {
  const [profile, setProfile] = useState<PublicUserProfile>();
  useLoad((options) => {
    if (options.id) void userService.publicProfile(options.id).then(setProfile).catch((error) => Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" }));
  });
  useShareAppMessage(() => ({ title: `${profile?.nickname || "骑友"}的机车主页`, path: `/pages/users/profile/index?id=${profile?.id || ""}&source=share`, imageUrl: profile?.avatar_url || "" }));
  if (!profile) return <Empty text="用户不存在" />;
  const report = async () => {
    try { await userService.report(profile.id); Taro.showToast({ title: "举报已提交", icon: "success" }); }
    catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "提交失败", icon: "none" }); }
  };
  return <View className="public-profile">
    <Text className="public-profile__report" onClick={() => void report()}>举报</Text>
    <View className="public-profile__hero">
      {profile.avatar_url ? <Image src={profile.avatar_url} /> : <View>{profile.nickname.slice(0, 1)}</View>}
      <Text>{profile.nickname}</Text>
      <Text>{profile.motorcycle_model || "车型待补充"} · 骑行{profile.riding_years || "-"}年</Text>
      <Text>{profile.bio || "这个人很酷，什么也没留下。"}</Text>
      {profile.wechat_id ? <Text className="public-profile__wechat" onClick={() => Taro.setClipboardData({ data: profile.wechat_id! })}>查看微信号</Text> : null}
    </View>
    <View className="public-profile__tabs"><Text className="public-profile__on">发布的同行</Text></View>
    <Empty text="暂无公开同行" />
  </View>;
}
