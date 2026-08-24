import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { loginWithWechat } from "@/services/auth";
import { useUserStore } from "@/stores/user-store";
import { redirectAfterLogin } from "@/utils/login-return";
import { LEGAL_CONSENT, legalDocumentUrl, type LegalDocumentKey } from "@/legal/legal-content";
import "./index.scss";

/** 独立授权页：退出后只会显示此页，绝不渲染旧用户资料。 */
export default function AuthPage() {
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(true);

  useDidShow(() => {
    useUserStore.getState().hydrate();
    if (useUserStore.getState().isLoggedIn) {
      void redirectAfterLogin();
    }
  });

  const handleLogin = async () => {
    if (submitting) return;
    if (!accepted) {
      Taro.showToast({ title: "请先阅读并勾选协议与安全须知", icon: "none" });
      return;
    }
    setSubmitting(true);
    try {
      const { isNewUser } = await loginWithWechat(LEGAL_CONSENT);
      if (isNewUser) {
        await Taro.redirectTo({ url: "/pages/profile/edit/index?onboarding=1" });
      } else {
        await redirectAfterLogin();
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "登录失败，请重试",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openLegal = (type: LegalDocumentKey) =>
    Taro.navigateTo({ url: legalDocumentUrl(type) });

  return (
    <View className="auth-page">
      <View className="auth-page__content">
        <View className="auth-page__logo">摩</View>
        <Text className="auth-page__title">摩搭子助手</Text>
        <Text className="auth-page__subtitle">摩友搭子，骑行不孤单</Text>
      </View>
      <View className="auth-page__footer">
        <Button
          className="auth-page__login"
          loading={submitting}
          disabled={submitting || !accepted}
          onClick={() => void handleLogin()}
        >
          微信身份登录
        </Button>
        <View className="auth-page__consent" onClick={() => setAccepted((value) => !value)}>
          <View className={`auth-page__checkbox${accepted ? " auth-page__checkbox--checked" : ""}`}>{accepted ? "✓" : ""}</View>
          <View className="auth-page__agreement">
            <Text>我已阅读并同意</Text>
            <Text className="auth-page__link" onClick={(event) => { event.stopPropagation(); void openLegal("user-agreement"); }}>《用户协议》</Text>
            <Text>和</Text>
            <Text className="auth-page__link" onClick={(event) => { event.stopPropagation(); void openLegal("privacy-policy"); }}>《隐私政策》</Text>
            <Text>，并已阅知</Text>
            <Text className="auth-page__link" onClick={(event) => { event.stopPropagation(); void openLegal("safety-notice"); }}>《安全须知》</Text>
          </View>
        </View>
      </View>
      {privacyOpen ? <View className="auth-page__privacy-dialog">
        <View className="auth-page__privacy-mask" />
        <View className="auth-page__privacy-panel">
          <Text className="auth-page__privacy-title">隐私保护提示</Text>
          <Text className="auth-page__privacy-copy">登录会通过微信临时登录凭证获取账号标识并建立会话，同时记录本次协议确认。首次登录后可主动选择微信头像、昵称并自愿填写微信号；位置、相册等权限只在使用对应功能时申请。</Text>
          <Text className="auth-page__privacy-link" onClick={() => void openLegal("privacy-policy")}>阅读完整《隐私政策》</Text>
          <Button className="auth-page__privacy-confirm" onClick={() => setPrivacyOpen(false)}>我已知晓，继续</Button>
        </View>
      </View> : null}
    </View>
  );
}
