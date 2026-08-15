import Taro from "@tarojs/taro";
import type { AgreementProof, SafetyAgreement, SafetyGuide } from "@/types/api";
import { request } from "./request";
import { ApiError } from "./request";

export const FULL_AGREEMENT_STORAGE_KEY = "v21:active-safety-agreement";
export type AgreementScene = SafetyAgreement["scene"];
export const safetyService = {
  activeAgreement: (scene: AgreementScene) => request<SafetyAgreement>({ url: "/safety-agreements/active", params: { scene } }),
  accidentGuide: () => request<SafetyGuide>({ url: "/safety-guides/accident-handling" }),
};

export async function confirmSafetyAgreement(scene: AgreementScene, target: string): Promise<{ agreement: AgreementProof; idempotencyKey: string } | null> {
  let agreement: SafetyAgreement;
  try { agreement = await safetyService.activeAgreement(scene); }
  catch (error) {
    // 强制确认必须失败关闭：协议缺失或功能不可用时不得绕过弹窗继续提交。
    // 此前返回 undefined 会让创建接口收到空 agreement，最终只显示后端 56001 Toast。
    if (error instanceof ApiError && error.code === 56001) {
      throw new ApiError("当前安全须知暂不可用，暂时无法提交，请稍后重试", error.code, error.status, error.requestId);
    }
    if (error instanceof ApiError && error.code === 52001) {
      throw new ApiError("安全确认服务暂不可用，请稍后重试", error.code, error.status, error.requestId);
    }
    throw error;
  }
  // 真机端可靠地使用原生确认框；全局 React 根节点上的弹层不会随页面状态刷新，
  // 会导致 Promise 一直未完成并把页面停在“发布中”。
  const result = await Taro.showModal({
    title: "安全须知与风险提示",
    content: `本次操作：${target}\n\n骑行活动由用户自发发起、自愿参与。摩托车骑行存在交通事故、道路状况、恶劣天气、车辆故障、人身伤害等固有风险。\n\n请确认：持有合法有效的摩托车驾驶资格；车辆符合安全行驶标准；身心状态适合骑行；已充分了解路线和天气。所有用户应自行评估风险，遵守交通法规，安全骑行。平台不对骑行活动中发生的人身伤害、财产损失承担法律责任。`,
    cancelText: "查看全文",
    confirmText: "直接确认",
    confirmColor: "#C74700",
  });
  if (!result.confirm) {
    Taro.setStorageSync(FULL_AGREEMENT_STORAGE_KEY, agreement);
    try {
      await Taro.navigateTo({ url: "/packageLegal/pages/safety-agreement/index" });
    } catch {
      Taro.showToast({ title: "全文页面打开失败，请稍后重试", icon: "none" });
    }
    return null;
  }
  return {
    agreement: { id: agreement.id, version: agreement.version, content_hash: agreement.content_hash },
    idempotencyKey: `${scene}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}
