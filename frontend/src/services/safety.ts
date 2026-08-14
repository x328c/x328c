import Taro from "@tarojs/taro";
import type { AgreementProof, SafetyAgreement, SafetyGuide } from "@/types/api";
import { request } from "./request";
import { ApiError } from "./request";

export type AgreementScene = SafetyAgreement["scene"];
export const safetyService = {
  activeAgreement: (scene: AgreementScene) => request<SafetyAgreement>({ url: "/safety-agreements/active", params: { scene } }),
  accidentGuide: () => request<SafetyGuide>({ url: "/safety-guides/accident-handling" }),
};

export async function confirmSafetyAgreement(scene: AgreementScene, target: string): Promise<{ agreement: AgreementProof; idempotencyKey: string } | null | undefined> {
  let agreement: SafetyAgreement;
  try { agreement = await safetyService.activeAgreement(scene); }
  catch (error) {
    if (error instanceof ApiError && (error.code === 56001 || error.code === 52001)) return undefined;
    throw error;
  }
  const first = await Taro.showModal({
    title: "安全须知与风险提示",
    content: `本次操作：${target}\n\n摩托车出行存在交通、路况、天气、车辆和人身风险。请确认驾驶资格、车辆和身心状态适合本次行程；遵守交规，不竞速、不危险驾驶。平台不是现场救援或保险机构，本确认不免除任何主体依法应承担的责任。`,
    cancelText: "暂不继续", confirmText: "查看全文", confirmColor: "#FF6A00",
  });
  if (!first.confirm) return null;
  const second = await Taro.showModal({
    title: `${agreement.title}（${agreement.version}）`,
    content: agreement.content,
    cancelText: "暂不继续", confirmText: "已阅读并确认", confirmColor: "#FF6A00",
  });
  if (!second.confirm) return null;
  return {
    agreement: { id: agreement.id, version: agreement.version, content_hash: agreement.content_hash },
    idempotencyKey: `${scene}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}
