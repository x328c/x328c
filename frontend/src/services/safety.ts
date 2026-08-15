import type { AgreementProof, SafetyAgreement, SafetyGuide } from "@/types/api";
import { useSafetyAgreementStore } from "@/stores/safety-agreement-store";
import { request } from "./request";
import { ApiError } from "./request";

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
  const confirmed = await useSafetyAgreementStore.getState().open(agreement, target);
  if (!confirmed) return null;
  return {
    agreement: { id: agreement.id, version: agreement.version, content_hash: agreement.content_hash },
    idempotencyKey: `${scene}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}
