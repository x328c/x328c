export interface FeatureFlagValues {
  'route.enabled': boolean;
  'regulation.enabled': boolean;
  'route.link_enabled': boolean;
  'route.comment_enabled': boolean;
  'route.comment_read_enabled': boolean;
  'safety_guide.enabled': boolean;
  'safety_agreement.enforced': boolean;
}

export type FeatureFlagKey = keyof FeatureFlagValues;
export type BooleanFeatureFlagKey = {
  [K in FeatureFlagKey]: FeatureFlagValues[K] extends boolean ? K : never;
}[FeatureFlagKey];

export const FEATURE_FLAG_DEFAULTS: FeatureFlagValues = {
  'route.enabled': false,
  'regulation.enabled': false,
  'route.link_enabled': false,
  'route.comment_enabled': true,
  'route.comment_read_enabled': true,
  'safety_guide.enabled': true,
  'safety_agreement.enforced': false,
};

export const FEATURE_FLAG_CACHE_TTL_SECONDS = 30;
