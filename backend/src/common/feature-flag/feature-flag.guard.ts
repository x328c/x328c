import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BooleanFeatureFlagKey } from './feature-flag.constants';
import { FEATURE_FLAG_METADATA } from './feature-flag.decorator';
import { FeatureFlagService } from './feature-flag.service';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<BooleanFeatureFlagKey>(FEATURE_FLAG_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;
    await this.flags.assertEnabled(key);
    return true;
  }
}
