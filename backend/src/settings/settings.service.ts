import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { IdempotencyService } from '../common/resilience/idempotency.service';
import { RateLimitService } from '../common/resilience/rate-limit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { UpdateUserSettingsDto } from './dto/settings.dto';

const DEFAULTS = {
  profile_visibility: 'public',
  contact_visible: false,
  ride_notifications: true,
  activity_notifications: true,
  system_notifications: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async get(userId: bigint) {
    const setting = await this.prisma.userSetting.findUnique({ where: { user_id: userId } });
    return setting ? this.serialize(setting) : DEFAULTS;
  }

  async update(userId: bigint, dto: UpdateUserSettingsDto) {
    const setting = await this.prisma.userSetting.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...dto },
      update: dto,
    });
    return this.serialize(setting);
  }

  async feedback(
    userId: bigint | undefined,
    actorKey: string,
    idempotencyKey: string | undefined,
    dto: CreateFeedbackDto,
  ) {
    if (!idempotencyKey)
      throw new AppException(40002, '请提供 Idempotency-Key', HttpStatus.BAD_REQUEST);
    if (idempotencyKey.length > 128)
      throw new AppException(40002, 'Idempotency-Key 过长', HttpStatus.BAD_REQUEST);
    await this.rateLimits.consume({
      scope: 'feedback.minute',
      subject: actorKey,
      limit: 5,
      windowSeconds: 60,
    });
    let fileRecordId: bigint | undefined;
    if (dto.file_record_id) {
      if (!userId) throw new AppException(1003, '匿名反馈不支持附件', HttpStatus.FORBIDDEN);
      fileRecordId = BigInt(dto.file_record_id);
      const ownedFile = await this.prisma.fileRecord.findFirst({
        where: { id: fileRecordId, user_id: userId },
        select: { id: true },
      });
      if (!ownedFile) throw new AppException(1003, '无权使用该附件', HttpStatus.FORBIDDEN);
    }
    const result = await this.idempotency.execute(
      { scope: 'app-feedback', actorKey, key: idempotencyKey, payload: dto },
      async () => {
        const record = await this.prisma.appFeedback.create({
          data: {
            user_id: userId,
            type: dto.type,
            description: dto.description.trim(),
            file_record_id: fileRecordId,
            idempotency_key: idempotencyKey,
          },
        });
        return { id: record.id.toString(), status: record.status, created_at: record.created_at };
      },
    );
    return { ...result.value, replayed: result.replayed };
  }

  private serialize(setting: Awaited<ReturnType<PrismaService['userSetting']['findUnique']>>) {
    if (!setting) return DEFAULTS;
    return {
      profile_visibility: setting.profile_visibility,
      contact_visible: setting.contact_visible,
      ride_notifications: setting.ride_notifications,
      activity_notifications: setting.activity_notifications,
      system_notifications: setting.system_notifications,
    };
  }
}
