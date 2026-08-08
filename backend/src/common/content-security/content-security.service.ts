import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cms } from 'tencentcloud-sdk-nodejs-cms';
import { AppException } from '../exceptions/app.exception';
import { sanitizeLogValue } from '../logging/log-sanitizer';

@Injectable()
export class ContentSecurityService {
  private readonly logger = new Logger(ContentSecurityService.name);
  constructor(private readonly config: ConfigService) {}

  async checkText(content: string, dataId: string): Promise<void> {
    if (this.config.get('CONTENT_SECURITY_ENABLED', 'false') !== 'true') return;
    try {
      const client = new cms.v20190321.Client({
        credential: {
          secretId: this.config.getOrThrow<string>('TENCENT_SECRET_ID'),
          secretKey: this.config.getOrThrow<string>('TENCENT_SECRET_KEY'),
        },
        region: this.config.get('TENCENT_CMS_REGION', 'ap-guangzhou'),
      });
      const result = await client.TextModeration({
        Content: Buffer.from(content).toString('base64'),
        DataId: dataId,
      });
      if (result.Data?.EvilFlag !== 0 || result.Data?.EvilType !== 100) {
        throw new AppException(3006, '内容未通过安全检测');
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      this.logger.error({ event: 'content_security_failed', error: sanitizeLogValue(error) });
      throw new AppException(9001, '内容安全检测服务暂不可用');
    }
  }
}
