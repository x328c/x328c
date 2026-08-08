export interface FeatureFlagValues {
  'route.enabled': boolean;
  'regulation.enabled': boolean;
  'forum.enabled': boolean;
  'forum.write_enabled': boolean;
  'forum.publish_mode': 'invite_only' | 'gray' | 'all';
}

export type FeatureFlagKey = keyof FeatureFlagValues;
export type BooleanFeatureFlagKey = {
  [K in FeatureFlagKey]: FeatureFlagValues[K] extends boolean ? K : never;
}[FeatureFlagKey];

export const FEATURE_FLAG_DEFAULTS: FeatureFlagValues = {
  'route.enabled': false,
  'regulation.enabled': false,
  'forum.enabled': false,
  'forum.write_enabled': false,
  'forum.publish_mode': 'invite_only',
};

export const FEATURE_FLAG_CACHE_TTL_SECONDS = 30;
