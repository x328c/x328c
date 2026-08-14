declare const __MESSAGE_TAB_INDEX__: number;
declare const __TAB_VARIANT__: '4' | '5';
declare const __LEGAL_BUNDLE_VERSION__: string;
declare const __USER_AGREEMENT_HASH__: string;
declare const __PRIVACY_POLICY_HASH__: string;
declare const __SAFETY_NOTICE_HASH__: string;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
