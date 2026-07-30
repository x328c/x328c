import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { loginWithWechat } from "@/services/auth";
import { useUserStore } from "@/stores/user-store";
import "./index.scss";

/** 独立授权页：退出后只会显示此页，绝不渲染旧用户资料。 */
export default function AuthPage() {
  const [submitting, setSubmitting] = useState(false);

  useDidShow(() => {
    useUserStore.getState().hydrate();
    if (useUserStore.getState().isLoggedIn) {
      void Taro.switchTab({ url: "/pages/index/index" });
    }
  });

  const handleLogin = async (userInfo?: { nickName: string; avatarUrl: string }) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await loginWithWechat(userInfo);
      await Taro.switchTab({ url: "/pages/index/index" });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "登录失败，请重试",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="auth-page">
      <View className="auth-page__content">
        <View className="auth-page__logo">骑</View>
        <Text className="auth-page__title">疆行机车圈</Text>
        <Text className="auth-page__subtitle">新疆摩友的骑行圈子</Text>
      </View>
      <View className="auth-page__footer">
        <Button
          className="auth-page__login"
          openType="getUserInfo"
          loading={submitting}
          disabled={submitting}
          onGetUserInfo={(e) => {
            if (e.detail.userInfo) {
              void handleLogin(e.detail.userInfo);
            }
          }}
        >
          微信一键登录
        </Button>
        <Text className="auth-page__agreement">
          登录即代表同意《用户协议》和《隐私政策》
        </Text>
      </View>
    </View>
  );
}
