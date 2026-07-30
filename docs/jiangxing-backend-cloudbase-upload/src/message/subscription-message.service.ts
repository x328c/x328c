import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

export type SubscriptionTemplate =
  'ride_join' | 'ride_departure' | 'ride_cancel' | 'activity_audit' | 'activity_cancel';
export type SubscriptionData = Record<string, { value: string }>;

@Injectable()
export class SubscriptionMessageService {
  private readonly logger = new Logger(SubscriptionMessageService.name);
  private readonly templates: Record<SubscriptionTemplate, string>;
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.templates = {
      ride_join: this.config.get('WECHAT_SUBSCRIBE_RIDE_JOIN_TEMPLATE_ID', ''),
      ride_departure: this.config.get('WECHAT_SUBSCRIBE_RIDE_DEPARTURE_TEMPLATE_ID', ''),
      ride_cancel: this.config.get('WECHAT_SUBSCRIBE_RIDE_CANCEL_TEMPLATE_ID', ''),
      activity_audit: this.config.get('WECHAT_SUBSCRIBE_ACTIVITY_AUDIT_TEMPLATE_ID', ''),
      activity_cancel: this.config.get('WECHAT_SUBSCRIBE_ACTIVITY_CANCEL_TEMPLATE_ID', ''),
    };
  }

  async push(
    notificationId: bigint,
    userId: bigint,
    template: SubscriptionTemplate,
    data: SubscriptionData,
    page?: string,
  ): Promise<void> {
    if (this.config.get('SUBSCRIPTION_MESSAGE_ENABLED', 'false') !== 'true') return;
    const templateId = this.templates[template];
    if (!templateId) {
      this.logger.warn(`Subscription template is not configured: ${template}`);
      return;
    }
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { openid: true },
      });
      if (!user?.openid) return;
      const accessToken = await this.getAccessToken();
      const result = await axios.post<{ errcode?: number; errmsg?: string }>(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        { touser: user.openid, template_id: templateId, page, data },
      );
      if (result.data.errcode && result.data.errcode !== 0)
        throw new Error(result.data.errmsg ?? `WeChat error ${result.data.errcode}`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { push_status: 1 },
      });
    } catch (error) {
      this.logger.warn(
        `Subscription push failed for notification ${notificationId.toString()}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.prisma.notification
        .update({ where: { id: notificationId }, data: { push_status: 2 } })
        .catch(() => undefined);
    }
  }

  private async getAccessToken(): Promise<string> {
    const cacheKey = 'wechat:access_token';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;
    const result = await axios.get<{ access_token?: string; expires_in?: number; errmsg?: string }>(
      'https://api.weixin.qq.com/cgi-bin/token',
      {
        params: {
          grant_type: 'client_credential',
          appid: this.config.getOrThrow<string>('WECHAT_APP_ID'),
          secret: this.config.getOrThrow<string>('WECHAT_APP_SECRET'),
        },
        timeout: 10_000,
      },
    );
    if (!result.data.access_token)
      throw new Error(result.data.errmsg ?? 'Unable to obtain WeChat access token');
    await this.redis.set(
      cacheKey,
      result.data.access_token,
      Math.max((result.data.expires_in ?? 7200) - 300, 60),
    );
    return result.data.access_token;
  }
}
