import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SubscriptionMessageService } from './subscription-message.service';

describe('SubscriptionMessageService', () => {
  it('redacts third-party token-bearing errors before logging', async () => {
    const config = {
      get: jest.fn((key: string, fallback = '') => {
        if (key === 'SUBSCRIPTION_MESSAGE_ENABLED') return 'true';
        if (key === 'WECHAT_SUBSCRIBE_RIDE_JOIN_TEMPLATE_ID') return 'template-id';
        return fallback;
      }),
      getOrThrow: jest.fn().mockReturnValue('configured-secret'),
    } as unknown as ConfigService;
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-secret' }) },
      notification: { update: jest.fn().mockResolvedValue(undefined) },
    } as unknown as PrismaService;
    const redis = {
      get: jest.fn().mockResolvedValue('access-token-secret'),
      set: jest.fn(),
    } as unknown as RedisService;
    const service = new SubscriptionMessageService(config, prisma, redis);
    const warn = jest.fn();
    (service as unknown as { logger: { warn: jest.Mock } }).logger = { warn };
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValue(new Error('request failed access_token=access-token-secret'));

    await service.push(42n, 7n, 'ride_join', { thing: { value: 'ok' } });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'subscription_push_failed',
        notificationId: '42',
        error: expect.objectContaining({
          message: 'request failed access_token=[REDACTED]',
        }),
      }),
    );
    expect(JSON.stringify(warn.mock.calls[0][0])).not.toContain('access-token-secret');
    post.mockRestore();
  });
});
