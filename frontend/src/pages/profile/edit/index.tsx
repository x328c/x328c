import { Button, Image, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { RIDE_STYLES } from "@/constants";
import { userService } from "@/services/users";
import { useUserStore } from "@/stores/user-store";
import { uploadImage } from "@/utils/upload";
import { redirectAfterLogin } from "@/utils/login-return";
import "./index.scss";

const initialForm = {
  avatar: "",
  nickname: "",
  bike: "",
  years: 1,
  styles: [] as string[],
  bio: "",
  wechat: "",
  location: 0,
  wechatVisible: 0,
};

export default function EditProfile() {
  const [form, setForm] = useState(initialForm);
  const [onboarding, setOnboarding] = useState(false);
  const [required, setRequired] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const optional = (value: string) => value.trim() || undefined;

  useLoad((options) => {
    const isOnboarding = options.onboarding === "1";
    setOnboarding(isOnboarding);
    setRequired(options.required === "1");
    if (isOnboarding) {
      void Taro.setNavigationBarTitle({ title: "完善首次登录资料" });
    }
    void userService
      .profile()
      .then((profile) =>
        { setHasPhone(Boolean(profile.phone)); setForm({
          avatar: profile.avatar_url || "",
          nickname: isOnboarding && profile.nickname === "新骑友" ? "" : profile.nickname,
          bike: profile.profile?.motorcycle_model || "",
          years: profile.profile?.riding_years || 1,
          styles: profile.profile?.riding_styles || [],
          bio: profile.profile?.bio || "",
          wechat: profile.profile?.wechat_id || "",
          location: profile.profile?.location_visible || 0,
          wechatVisible: profile.profile?.wechat_visible || 0,
        }); },
      )
      .catch(() => undefined);
  });

  const chooseAvatar = async (path: string) => {
    try {
      Taro.showLoading({ title: "上传头像中" });
      update("avatar", await uploadImage(path, "image/jpeg", "avatars"));
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "头像上传失败",
        icon: "none",
      });
    } finally {
      Taro.hideLoading();
    }
  };

  const finishOnboarding = async () => {
    if (required) { await Taro.navigateBack(); return; }
    if (onboarding) await redirectAfterLogin();
    else await Taro.navigateBack();
  };

  const save = async () => {
    if (saving) return;
    if (!form.avatar || !form.nickname.trim() || !form.bike.trim() || (!hasPhone && !form.wechat.trim())) {
      Taro.showToast({ title: "请完善头像、名称、联系方式和车型", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const profile = await userService.update({
        avatar_url: optional(form.avatar),
        nickname: optional(form.nickname),
        motorcycle_model: optional(form.bike),
        riding_years: form.years,
        riding_styles: form.styles.length ? form.styles : undefined,
        bio: optional(form.bio),
        wechat_id: optional(form.wechat),
        location_visible: form.location,
        wechat_visible: form.wechatVisible,
      });
      const session = useUserStore.getState();
      if (session.accessToken && session.refreshToken) {
        session.setSession(session.accessToken, session.refreshToken, profile);
      }
      Taro.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => void finishOnboarding(), 500);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "保存失败",
        icon: "none",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="edit-profile">
      {onboarding || required ? (
        <View className="edit-profile__intro">
          <Text className="edit-profile__intro-title">欢迎加入摩搭子助手</Text>
          <Text className="edit-profile__intro-copy">
            完成头像、用户名称、微信号或手机号、车型后，即可发起同行、报名同行和公开路线。微信号无法由小程序自动读取，请主动填写。
          </Text>
        </View>
      ) : null}
      <Button
        className="edit-profile__avatar"
        openType="chooseAvatar"
        onChooseAvatar={(event) => void chooseAvatar(event.detail.avatarUrl)}
      >
        {form.avatar ? <Image src={form.avatar} /> : <Text>选择微信头像</Text>}
      </Button>
      <Text className="edit-profile__avatar-hint">点击头像，从微信头像或相册中主动选择</Text>
      <View className="edit-profile__group">
        <View className="edit-profile__field">
          <Text className="edit-profile__label">用户名称</Text>
          <Input
            className="edit-profile__input"
            type="nickname"
            value={form.nickname}
            placeholder="点击选择微信昵称或自行填写"
            onInput={(event) => update("nickname", event.detail.value)}
          />
        </View>
        <View className="edit-profile__field">
          <Text className="edit-profile__label">微信号{hasPhone ? "（手机号已绑定，可选）" : "（必填）"}</Text>
          <Input
            className="edit-profile__input"
            value={form.wechat}
            placeholder="微信暂不提供自动读取能力"
            onInput={(event) => update("wechat", event.detail.value)}
          />
        </View>
        <Input
          value={form.bike}
          placeholder="车型"
          onInput={(event) => update("bike", event.detail.value)}
        />
        <Picker
          mode="selector"
          range={[1, 2, 3, 4]}
          value={form.years - 1}
          onChange={(event) => update("years", Number(event.detail.value) + 1)}
        >
          <Text>骑行年限：{form.years}年</Text>
        </Picker>
        <Text>骑行风格</Text>
        <View>
          {Object.values(RIDE_STYLES).map((style) => (
            <Text
              key={style}
              className={
                form.styles.includes(style)
                  ? "edit-profile__tag edit-profile__tag--on"
                  : "edit-profile__tag"
              }
              onClick={() =>
                update(
                  "styles",
                  form.styles.includes(style)
                    ? form.styles.filter((value) => value !== style)
                    : [...form.styles, style],
                )
              }
            >
              {style}
            </Text>
          ))}
        </View>
        <Textarea
          value={form.bio}
          placeholder="个人简介"
          onInput={(event) => update("bio", event.detail.value)}
        />
        <Text onClick={() => update("location", form.location ? 0 : 2)}>
          位置可见：{form.location ? "公开" : "关闭"}
        </Text>
        <Text onClick={() => update("wechatVisible", form.wechatVisible ? 0 : 2)}>
          微信号可见：{form.wechatVisible ? "公开" : "关闭"}
        </Text>
      </View>
      <Button className="edit-profile__save" loading={saving} onClick={() => void save()}>
        {onboarding || required ? "保存并继续" : "保存"}
      </Button>
    </View>
  );
}
