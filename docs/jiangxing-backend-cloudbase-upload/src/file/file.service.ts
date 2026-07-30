import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sts } from 'tencentcloud-sdk-nodejs-sts';
import { randomUUID } from 'crypto';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { UploadCallbackDto, UploadSignatureDto } from './dto';

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

@Injectable()
export class FileService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  async createUploadSignature(userId: bigint, dto: UploadSignatureDto) {
    const bucket = this.config.getOrThrow<string>('COS_BUCKET');
    const region = this.config.getOrThrow<string>('COS_REGION');
    const key = this.createFileKey(userId, dto.category ?? 'rides', dto.file_type);
    const credential = await this.getTemporaryCredential(key, bucket, region, userId);
    return {
      credentials: credential,
      bucket,
      region,
      file_key: key,
      file_url: this.originUrl(key, bucket, region),
      cdn_url: this.cdnUrl(key),
      expires_in: 1800,
      max_file_size: MAX_IMAGE_SIZE,
    };
  }
  async recordUpload(userId: bigint, dto: UploadCallbackDto) {
    if (!MIME_EXTENSION[dto.file_type]) throw new AppException(1001, '仅支持 jpg、png、webp 图片');
    if (dto.file_size > MAX_IMAGE_SIZE) throw new AppException(1001, '图片不能超过5MB');
    if (!this.ownsKey(dto.file_key, userId)) throw new AppException(1003, '无权限记录该文件');
    const bucket = this.config.getOrThrow<string>('COS_BUCKET');
    const region = this.config.getOrThrow<string>('COS_REGION');
    const expected = this.originUrl(dto.file_key, bucket, region);
    if (dto.file_url !== expected) throw new AppException(1001, '文件地址与存储路径不匹配');
    const cdnUrl = this.cdnUrl(dto.file_key);
    const record = await this.prisma.fileRecord.upsert({
      where: { file_key: dto.file_key },
      create: {
        user_id: userId,
        file_key: dto.file_key,
        file_url: dto.file_url,
        cdn_url: cdnUrl,
        file_size: dto.file_size,
        file_type: dto.file_type,
      },
      update: {
        file_url: dto.file_url,
        cdn_url: cdnUrl,
        file_size: dto.file_size,
        file_type: dto.file_type,
      },
    });
    return { id: record.id.toString(), file_key: record.file_key, cdn_url: record.cdn_url };
  }
  private async getTemporaryCredential(
    key: string,
    bucket: string,
    region: string,
    userId: bigint,
  ) {
    try {
      const client = new sts.v20180813.Client({
        credential: {
          secretId: this.config.getOrThrow<string>('COS_SECRET_ID'),
          secretKey: this.config.getOrThrow<string>('COS_SECRET_KEY'),
        },
        region,
      });
      const appId = this.config.get<string>('COS_APP_ID') || bucket.split('-').pop();
      const policy = JSON.stringify({
        version: '2.0',
        statement: [
          {
            effect: 'allow',
            action: ['name/cos:PutObject'],
            resource: [`qcs::cos:${region}:uid/${appId}:${bucket}/${key}`],
          },
        ],
      });
      const response = await client.GetFederationToken({
        Name: `upload_${userId.toString()}`,
        Policy: policy,
        DurationSeconds: 1800,
      });
      if (!response.Credentials) throw new Error('STS credentials missing');
      return {
        tmp_secret_id: response.Credentials.TmpSecretId,
        tmp_secret_key: response.Credentials.TmpSecretKey,
        session_token: response.Credentials.Token,
        expired_time: response.ExpiredTime,
      };
    } catch (error) {
      throw new AppException(
        9001,
        `获取上传凭证失败：${error instanceof Error ? error.message : 'unknown error'}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
  private createFileKey(userId: bigint, category: string, type: string) {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${category}/${yyyy}/${mm}/${dd}/${userId.toString()}/${randomUUID()}.${MIME_EXTENSION[type]}`;
  }
  private ownsKey(key: string, userId: bigint) {
    return new RegExp(
      `^(rides|activities|avatars)/\\d{4}/\\d{2}/\\d{2}/${userId.toString()}/[a-f0-9-]+\\.(jpg|png|webp)$`,
    ).test(key);
  }
  private originUrl(key: string, bucket: string, region: string) {
    return `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
  }
  private cdnUrl(key: string) {
    const domain = this.config
      .getOrThrow<string>('COS_CDN_DOMAIN')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    return `https://${domain}/${key}`;
  }
}
