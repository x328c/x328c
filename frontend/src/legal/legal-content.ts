import userAgreement from "../../../docs/V2.1文档/合规文档/用户协议.md?raw";
import privacyPolicy from "../../../docs/V2.1文档/合规文档/隐私政策.md?raw";
import safetyNotice from "../../../docs/V2.1文档/合规文档/安全须知.md?raw";

export type LegalDocumentKey = "user-agreement" | "privacy-policy" | "safety-notice";

export const LEGAL_CONSENT = {
  accepted: true as const,
  bundle_version: __LEGAL_BUNDLE_VERSION__,
  user_agreement_hash: __USER_AGREEMENT_HASH__,
  privacy_policy_hash: __PRIVACY_POLICY_HASH__,
  safety_notice_hash: __SAFETY_NOTICE_HASH__,
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, { title: string; content: string }> = {
  "user-agreement": { title: "用户协议", content: userAgreement },
  "privacy-policy": { title: "隐私政策", content: privacyPolicy },
  "safety-notice": { title: "安全须知", content: safetyNotice },
};

export const legalDocumentUrl = (type: LegalDocumentKey) =>
  `/packageLegal/pages/document/index?type=${type}`;

export function isLegalDocumentKey(value?: string): value is LegalDocumentKey {
  return Boolean(value && Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, value));
}
