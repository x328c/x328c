import { SetMetadata } from '@nestjs/common';
import { BooleanFeatureFlagKey } from './feature-flag.constants';

export const FEATURE_FLAG_METADATA = 'feature_flag';

export const RequireFeatureFlag = (key: BooleanFeatureFlagKey) =>
  SetMetadata(FEATURE_FLAG_METADATA, key);
