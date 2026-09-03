import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateLimitService } from '../common/resilience/rate-limit.service';
import { TrackTelemetryEventDto } from './dto/telemetry.dto';
import { isRegionEvent, sanitizeRegionProperties } from './region-telemetry';

const MAX_PROPERTIES = 20;
const SAFE_KEY = /^[a-z][a-z0-9_]{0,63}$/;

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async track(
    dto: TrackTelemetryEventDto,
    userId: bigint | undefined,
    subject: string,
  ): Promise<{ accepted: true; duplicate: boolean }> {
    await this.rateLimit.consume({
      scope: 'telemetry.events',
      subject,
      limit: 120,
      windowSeconds: 60,
      failClosed: false,
    });
    const occurredAt = new Date(dto.occurred_at);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new AppException(40001, '埋点时间无效', HttpStatus.BAD_REQUEST);
    }
    const entries = Object.entries(dto.properties ?? {});
    if (entries.length > MAX_PROPERTIES || entries.some(([key]) => !SAFE_KEY.test(key))) {
      throw new AppException(40001, '埋点属性不符合规范', HttpStatus.BAD_REQUEST);
    }
    const properties = isRegionEvent(dto.name) ? sanitizeRegionProperties(dto.name, dto.properties) : Object.fromEntries(
      entries.filter(
        ([, value]) =>
          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
      ),
    ) as Prisma.InputJsonObject;
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          event_id: dto.event_id,
          name: dto.name,
          user_id: isRegionEvent(dto.name) ? undefined : userId,
          properties,
          occurred_at: occurredAt,
        },
      });
      return { accepted: true, duplicate: false };
    } catch (error) {
      if (this.isUniqueViolation(error)) return { accepted: true, duplicate: true };
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
      (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
    );
  }
}
