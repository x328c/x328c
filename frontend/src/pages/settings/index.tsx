import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { logout } from "@/services/auth";
import "./index.scss";

export default function Settings() {
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
  return <View className="settings">
    <View className="settings__menu">{["隐私设置", "通知设置", "意见反馈", "关于我们"].map((item) => <Text onClick={() => Taro.showToast({ title: `${item}即将开放`, icon: "none" })}>{item} ›</Text>)}</View>
    <View className="settings__logout" onClick={() => void handleLogout()}>退出登录</View>
  </View>;
}
