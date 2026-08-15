import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { FULL_AGREEMENT_STORAGE_KEY, useSafetyAgreementStore } from "@/stores/safety-agreement-store";
import "./index.scss";

export function SafetyAgreementDialog() {
  const pending = useSafetyAgreementStore((state) => state.pending);
  const confirm = useSafetyAgreementStore((state) => state.confirm);
  const cancel = useSafetyAgreementStore((state) => state.cancel);

  if (!pending) return null;

  const viewFull = async () => {
    Taro.setStorageSync(FULL_AGREEMENT_STORAGE_KEY, pending.agreement);
    try {
      await Taro.navigateTo({ url: "/packageLegal/pages/safety-agreement/index" });
    } catch {
      Taro.showToast({ title: "全文页面打开失败，请稍后重试", icon: "none" });
    }
  };

  return <View className="safety-confirm" catchMove>
    <View className="safety-confirm__mask" />
    <View className="safety-confirm__panel">
      <Text className="safety-confirm__eyebrow">发布或参与前确认</Text>
      <Text className="safety-confirm__title">安全须知与风险提示</Text>
      <Text className="safety-confirm__target">本次操作：{pending.target}</Text>
      <View className="safety-confirm__content">
        <Text>骑行活动由用户自发发起、自愿参与。摩托车骑行存在固有风险，包括但不限于：交通事故、道路状况、恶劣天气、车辆故障、人身伤害等。</Text>
        <Text className="safety-confirm__subtitle">发起人和参与人均应确认：</Text>
        <Text>1. 持有合法有效的摩托车驾驶资格</Text>
        <Text>2. 车辆符合安全行驶标准</Text>
        <Text>3. 身心状态适合骑行</Text>
        <Text>4. 已充分了解路线和天气情况</Text>
        <Text className="safety-confirm__notice">所有用户应自行评估风险，遵守交通法规，安全骑行。平台不对任何骑行活动中发生的人身伤害、财产损失承担法律责任。骑行过程中请遵守交通规则。</Text>
      </View>
      <View className="safety-confirm__actions">
        <Text className="safety-confirm__button safety-confirm__button--quiet" onClick={cancel}>暂不继续</Text>
        <Text className="safety-confirm__button safety-confirm__button--link" onClick={() => void viewFull()}>查看全文</Text>
        <Text className="safety-confirm__button safety-confirm__button--primary" onClick={confirm}>直接确认</Text>
      </View>
      <Text className="safety-confirm__hint">确认表示你已了解上述风险；阅读全文为自愿操作。</Text>
    </View>
  </View>;
}
