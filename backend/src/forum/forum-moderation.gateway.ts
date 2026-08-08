import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cms } from 'tencentcloud-sdk-nodejs-cms';

export type ModerationDecision =
  | { decision: 'pass' }
  | { decision: 'reject'; reason: string }
  | { decision: 'error'; code: string };

@Injectable()
export class ForumModerationGateway {
  constructor(private readonly config: ConfigService) {}

  async checkText(content: string, dataId: string): Promise<ModerationDecision> {
    if (this.config.get('CONTENT_SECURITY_ENABLED', 'false') !== 'true') {
      return { decision: 'error', code: 'provider_disabled' };
    }
    try {
      const response = await this.withTimeout(
        this.client().TextModeration({
          Content: Buffer.from(content).toString('base64'),
          DataId: dataId,
        }),
      );
      if ((response.BusinessCode ?? 0) !== 0 || !response.Data) {
        return { decision: 'error', code: `provider_${response.BusinessCode ?? 'empty'}` };
      }
      return response.Data.EvilFlag === 0 && response.Data.EvilType === 100
        ? { decision: 'pass' }
        : { decision: 'reject', reason: '自动内容审核未通过，请修改后重新提交' };
    } catch (error) {
      return { decision: 'error', code: this.errorCode(error) };
    }
  }

  async checkImage(fileUrl: string): Promise<ModerationDecision> {
    if (this.config.get('CONTENT_SECURITY_ENABLED', 'false') !== 'true') {
      return { decision: 'error', code: 'provider_disabled' };
    }
    try {
      const response = await this.withTimeout(this.client().ImageModeration({ FileUrl: fileUrl }));
      if ((response.BusinessCode ?? 0) !== 0 || !response.Data) {
        return { decision: 'error', code: `provider_${response.BusinessCode ?? 'empty'}` };
      }
      return response.Data.EvilFlag === 0 && response.Data.EvilType === 100
        ? { decision: 'pass' }
        : { decision: 'reject', reason: '图片自动审核未通过，请删除或更换后重新提交' };
    } catch (error) {
      return { decision: 'error', code: this.errorCode(error) };
    }
  }

  private client() {
    return new cms.v20190321.Client({
      credential: {
        secretId: this.config.getOrThrow<string>('TENCENT_SECRET_ID'),
        secretKey: this.config.getOrThrow<string>('TENCENT_SECRET_KEY'),
      },
      region: this.config.get('TENCENT_CMS_REGION', 'ap-guangzhou'),
    });
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const configured = Number(this.config.get('FORUM_MODERATION_TIMEOUT_MS', '5000'));
    const timeoutMs = Number.isFinite(configured)
      ? Math.min(Math.max(configured, 1000), 15_000)
      : 5000;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('moderation_timeout')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private errorCode(error: unknown): string {
    const raw = error instanceof Error ? error.message : 'unknown';
    if (raw === 'moderation_timeout') return raw;
    return 'provider_unavailable';
  }
}
