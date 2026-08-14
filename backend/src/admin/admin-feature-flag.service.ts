import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import {
  FEATURE_FLAG_DEFAULTS,
  FeatureFlagKey,
  FeatureFlagValues,
} from '../common/feature-flag/feature-flag.constants';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateFeatureFlagsDto } from './dto';

export const MANAGED_FEATURE_FLAG_KEYS = [
  'route.enabled',
  'regulation.enabled',
  'forum.enabled',
  'forum.write_enabled',
  'forum.publish_mode',
  'route.link_enabled',
  'route.comment_enabled',
  'route.comment_read_enabled',
  'safety_guide.enabled',
  'safety_agreement.enforced',
] as const satisfies readonly FeatureFlagKey[];

type ManagedValues = Pick<FeatureFlagValues, (typeof MANAGED_FEATURE_FLAG_KEYS)[number]>;

@Injectable()
export class AdminFeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly operationLogs: OperationLogService,
  ) {}

  async getAll() {
    const values = await Promise.all(MANAGED_FEATURE_FLAG_KEYS.map((key) => this.flags.get(key)));
    return this.serialize(
      Object.fromEntries(
        MANAGED_FEATURE_FLAG_KEYS.map((key, index) => [key, values[index]]),
      ) as ManagedValues,
    );
  }

  async update(dto: UpdateFeatureFlagsDto, actor: OperationActorContext) {
    if (dto.forum_write_enabled && !dto.forum_enabled) {
      throw new AppException(40001, '论坛总开关关闭时不能开启论坛写入', HttpStatus.BAD_REQUEST);
    }
    if (dto.route_comment_enabled && !dto.route_comment_read_enabled) {
      throw new AppException(
        40001,
        '路线评论写入开启时必须同时开启公开读取',
        HttpStatus.BAD_REQUEST,
      );
    }

    const after = this.fromDto(dto);
    await this.prisma.$transaction(async (tx) => {
      const records = await tx.featureFlag.findMany({
        where: { key: { in: [...MANAGED_FEATURE_FLAG_KEYS] }, deleted_at: null },
        select: { key: true, value: true },
      });
      const persisted = new Map(records.map((record) => [record.key, record.value]));
      const before = Object.fromEntries(
        MANAGED_FEATURE_FLAG_KEYS.map((key) => [key, this.parsePersisted(key, persisted.get(key))]),
      ) as ManagedValues;

      for (const key of MANAGED_FEATURE_FLAG_KEYS) {
        await tx.featureFlag.upsert({
          where: { key },
          create: { key, value: String(after[key]), updated_by: actor.adminId },
          update: { value: String(after[key]), updated_by: actor.adminId, deleted_at: null },
        });
      }
      await this.operationLogs.appendWithClient(tx, {
        ...actor,
        action: 'feature_flags.update',
        objectType: 'feature_flags',
        objectId: 'v2.1',
        reason: dto.reason,
        beforeSummary: before,
        afterSummary: after,
      });
    });

    await this.flags.invalidate(MANAGED_FEATURE_FLAG_KEYS);
    return this.getAll();
  }

  private fromDto(dto: UpdateFeatureFlagsDto): ManagedValues {
    return {
      'route.enabled': dto.route_enabled,
      'regulation.enabled': dto.regulation_enabled,
      'forum.enabled': dto.forum_enabled,
      'forum.write_enabled': dto.forum_write_enabled,
      'forum.publish_mode': dto.forum_publish_mode,
      'route.link_enabled': dto.route_link_enabled,
      'route.comment_enabled': dto.route_comment_enabled,
      'route.comment_read_enabled': dto.route_comment_read_enabled,
      'safety_guide.enabled': dto.safety_guide_enabled,
      'safety_agreement.enforced': dto.safety_agreement_enforced,
    };
  }

  private serialize(values: ManagedValues) {
    return {
      route_enabled: values['route.enabled'],
      regulation_enabled: values['regulation.enabled'],
      forum_enabled: values['forum.enabled'],
      forum_write_enabled: values['forum.write_enabled'],
      forum_publish_mode: values['forum.publish_mode'],
      route_link_enabled: values['route.link_enabled'],
      route_comment_enabled: values['route.comment_enabled'],
      route_comment_read_enabled: values['route.comment_read_enabled'],
      safety_guide_enabled: values['safety_guide.enabled'],
      safety_agreement_enforced: values['safety_agreement.enforced'],
    };
  }

  private parsePersisted<K extends FeatureFlagKey>(
    key: K,
    value: string | undefined,
  ): FeatureFlagValues[K] {
    if (value === undefined) return FEATURE_FLAG_DEFAULTS[key];
    if (key === 'forum.publish_mode') {
      return (
        ['invite_only', 'gray', 'all'].includes(value) ? value : FEATURE_FLAG_DEFAULTS[key]
      ) as FeatureFlagValues[K];
    }
    if (value === 'true') return true as FeatureFlagValues[K];
    if (value === 'false') return false as FeatureFlagValues[K];
    return FEATURE_FLAG_DEFAULTS[key];
  }
}
