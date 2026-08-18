import { Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { logout } from "@/services/auth";
import { settingsService } from "@/services/settings";
import type { UserSettings } from "@/types/api";
import { ENV } from "@/config";
import { legalDocumentUrl } from "@/legal/legal-content";
import { userService } from "@/services/users";
import "./index.scss";

const defaults: UserSettings = { profile_visibility: "public", contact_visible: false, ride_notifications: true, activity_notifications: true, system_notifications: true };
const visibility = [{ value: "public", label: "所有人" }, { value: "participants", label: "同行参与者" }, { value: "private", label: "仅自己" }] as const;

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"general" | "source_broken">("general");

  useLoad((options = {}) => {
    if (options.feedback === "source_broken") { setFeedbackType("source_broken"); setFeedbackOpen(true); }
    void settingsService.get().then(setSettings).catch((error) => Taro.showToast({ title: error instanceof Error ? error.message : "设置加载失败", icon: "none" })).finally(() => setLoading(false));
  });

  const update = async (patch: Partial<UserSettings>) => {
    if (loading) return;
    const previous = settings; const next = { ...settings, ...patch }; setSettings(next);
    try { setSettings(await settingsService.update(next)); }
    catch (error) { setSettings(previous); Taro.showToast({ title: error instanceof Error ? error.message : "保存失败，已恢复", icon: "none" }); }
  };
  const handleLogout = async () => {
    const result = await Taro.showModal({ title: "确认退出登录", content: "退出后将不再显示当前账号的个人资料和助手通知。", confirmText: "退出登录", confirmColor: "#C74700" });
    if (!result.confirm) return; await logout(); await Taro.reLaunch({ url: "/pages/auth/index" });
  };
  const handleCloseAccount = async () => {
    const result = await Taro.showModal({
      title: "确认注销账号",
      content: "注销后将立即停止登录，个人资料会删除或匿名化，已发布内容会停止公开；依法需要留存的安全和争议记录将在期限届满后处理。该操作不可撤销。",
      confirmText: "确认注销",
      confirmColor: "#C74700",
    });
    if (!result.confirm) return;
    try {
      await userService.closeAccount();
      await logout();
      await Taro.reLaunch({ url: "/pages/auth/index" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "注销失败，请稍后重试", icon: "none" });
    }
  };
  const clearCache = async () => {
    const result = await Taro.showModal({ title: "清理非关键缓存", content: "不会清除账号登录、登录回跳和待发布草稿。", confirmText: "清理" });
    if (!result.confirm) return;
    const protectedKeys = new Set(["jiangxing_access_token", "jiangxing_refresh_token", "jiangxing_user", "modazi_login_return_url", "v21:create-route"]);
    const keys = Taro.getStorageInfoSync().keys.filter((key) => !protectedKeys.has(key) && !key.includes("draft") && !key.includes("idempotency"));
    keys.forEach((key) => Taro.removeStorageSync(key));
    Taro.showToast({ title: `已清理 ${keys.length} 项缓存`, icon: "success" });
  };
  const submitFeedback = async () => {
    if (feedback.trim().length < 2) return Taro.showToast({ title: "请至少填写 2 个字", icon: "none" });
    try { await settingsService.feedback(feedbackType, feedback.trim()); setFeedback(""); setFeedbackOpen(false); Taro.showToast({ title: "反馈已提交", icon: "success" }); }
    catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "提交失败", icon: "none" }); }
  };
  const openLegal = (type: "user-agreement" | "privacy-policy" | "safety-notice") =>
    Taro.navigateTo({ url: legalDocumentUrl(type) });
  const section = (title: string, children: React.ReactNode) => <View className="settings__section"><Text className="settings__heading">{title}</Text>{children}</View>;
  // 不使用小程序原生 Switch：在部分真机环境中，受控 checked 值在页面初次
  // 回填和销毁时会额外触发 change，造成“展示联系方式”被自动改写。
  const toggle = (title: string, key: keyof Pick<UserSettings, "contact_visible" | "ride_notifications" | "activity_notifications" | "system_notifications">) => {
    const checked = settings[key];
    return <View className="settings__row">
      <Text>{title}</Text>
      <View
        className={`settings__switch ${checked ? "settings__switch--on" : ""}`}
        role="switch"
        aria-checked={checked}
        onClick={() => void update({ [key]: !checked })}
      ><View className="settings__switch-thumb" /></View>
    </View>;
  };
  return <View className="settings">
    {section("账号与安全", <><View className="settings__row"><Text>账号状态</Text><Text>已登录</Text></View><View className="settings__row" onClick={() => void handleCloseAccount()}><Text>账号注销与信息删除</Text><Text>申请注销 ›</Text></View></>)}
    {section("隐私与个人信息", <><Picker mode="selector" range={visibility.map((item) => item.label)} value={Math.max(0, visibility.findIndex((item) => item.value === settings.profile_visibility))} onChange={(event) => void update({ profile_visibility: visibility[Number(event.detail.value)].value })}><View className="settings__row"><Text>个人资料公开范围</Text><Text>{visibility.find((item) => item.value === settings.profile_visibility)?.label} ›</Text></View></Picker>{toggle("展示联系方式", "contact_visible")}<View className="settings__row" onClick={() => void openLegal("privacy-policy")}><Text>隐私政策与个人信息清单</Text><Text>完整内容 ›</Text></View><View className="settings__hint">个人位置用于附近功能前会模糊偏移；相册、位置等权限仅在使用对应功能时申请，可随时在微信设置中撤回。</View></>)}
    {section("通知", <>{toggle("同行微信推送", "ride_notifications")}{toggle("系统微信推送", "system_notifications")}<View className="settings__row" onClick={() => Taro.openSetting()}><Text>微信系统通知权限</Text><Text>前往系统设置 ›</Text></View></>)}
    {section("系统权限", <><View className="settings__row" onClick={() => Taro.openSetting()}><Text>定位、相机与相册</Text><Text>查看真实授权状态 ›</Text></View></>)}
    {section("协议、安全与帮助", <><View className="settings__row" onClick={() => void openLegal("user-agreement")}><Text>用户协议</Text><Text>查看全文 ›</Text></View><View className="settings__row" onClick={() => void openLegal("privacy-policy")}><Text>隐私政策</Text><Text>查看全文 ›</Text></View><View className="settings__row" onClick={() => void openLegal("safety-notice")}><Text>骑行安全须知</Text><Text>查看全文 ›</Text></View><View className="settings__row" onClick={() => Taro.navigateTo({ url: "/packageRegulations/pages/accident-guide/index" })}><Text>骑行应急知识</Text><Text>›</Text></View><View className="settings__row" onClick={() => setFeedbackOpen(true)}><Text>意见反馈与权利申请</Text><Text>›</Text></View></>)}
    {section("存储与版本", <><View className="settings__row" onClick={() => void clearCache()}><Text>清理非关键缓存</Text><Text>›</Text></View><View className="settings__row"><Text>版本</Text><Text>V2.2 · {ENV} · 4 Tab</Text></View></>)}
    {section("关于", <View className="settings__row"><Text>摩搭子助手</Text><Text>骑行同行与安全知识服务</Text></View>)}
    <View className="settings__logout" onClick={() => void handleLogout()}>退出登录</View>
    {feedbackOpen ? <View className="settings__feedback"><View className="settings__feedback-mask" onClick={() => setFeedbackOpen(false)} /><View className="settings__feedback-panel"><Text className="settings__heading">{feedbackType === "source_broken" ? "内容有误 / 来源失效" : "意见反馈"}</Text><Textarea value={feedback} maxlength={1000} placeholder="请描述问题或建议（2-1000 字）" onInput={(event) => setFeedback(event.detail.value)} /><Text>{feedback.length}/1000</Text><View className="settings__feedback-submit" onClick={() => void submitFeedback()}>提交反馈</View></View></View> : null}
  </View>;
}
