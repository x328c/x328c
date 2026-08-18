import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sts } from 'tencentcloud-sdk-nodejs-sts';
import { randomUUID } from 'crypto';
import axios from 'axios';
import COS from 'cos-nodejs-sdk-v5';
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
      start_time: Math.floor(Date.now() / 1000) - 30,
      max_file_size: MAX_IMAGE_SIZE,
    };
  }
  async recordUpload(userId: bigint, dto: UploadCallbackDto) {
    if (!MIME_EXTENSION[dto.file_type]) throw new AppException(1001, '仅支持 jpg、png、webp 图片');
    if (dto.file_size > MAX_IMAGE_SIZE) throw new AppException(1001, '图片不能超过5MB');
    if (!this.ownsKey(dto.file_key, userId)) throw new AppException(1003, '无权限记录该文件');
    if (!dto.file_key.endsWith(`.${MIME_EXTENSION[dto.file_type]}`)) {
      throw new AppException(1001, '图片扩展名与声明类型不匹配');
    }
    const bucket = this.config.getOrThrow<string>('COS_BUCKET');
    const region = this.config.getOrThrow<string>('COS_REGION');
    const expected = this.originUrl(dto.file_key, bucket, region);
    if (dto.file_url !== expected) throw new AppException(1001, '文件地址与存储路径不匹配');
    if (dto.file_key.startsWith('route-comments/') || dto.file_key.startsWith('user-routes/')) {
      await this.verifyUploadedImage(dto.file_url, dto.file_key, bucket, region, dto.file_type);
    }
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
      `^(rides|avatars|route-comments|user-routes)/\\d{4}/\\d{2}/\\d{2}/${userId.toString()}/[a-f0-9-]+\\.(jpg|png|webp)$`,
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

  private async verifyUploadedImage(
    url: string,
    key: string,
    bucket: string,
    region: string,
    expectedMime: string,
  ): Promise<void> {
    let bytes: Buffer;
    try {
      const secretId = this.config.get<string>('COS_SECRET_ID');
      const secretKey = this.config.get<string>('COS_SECRET_KEY');
      const verificationUrl =
        secretId && secretKey
          ? new COS({ SecretId: secretId, SecretKey: secretKey }).getObjectUrl({
              Bucket: bucket,
              Region: region,
              Key: key,
              Sign: true,
              Expires: 60,
            })
          : url;
      const response = await axios.get<ArrayBuffer>(verificationUrl, {
        responseType: 'arraybuffer',
        headers: { Range: 'bytes=0-131071' },
        timeout: 5000,
        maxContentLength: 131_072,
      });
      bytes = Buffer.from(response.data);
    } catch {
      throw new AppException(1001, '无法验证上传图片，请重新上传');
    }
    const metadata = this.imageMetadata(bytes);
    if (!metadata || metadata.mime !== expectedMime) {
      throw new AppException(1001, '图片文件头与声明类型不匹配');
    }
    if (
      metadata.width < 1 ||
      metadata.height < 1 ||
      metadata.width > 8192 ||
      metadata.height > 8192
    ) {
      throw new AppException(1001, '图片尺寸无效或超过 8192×8192');
    }
  }

  private imageMetadata(bytes: Buffer): { mime: string; width: number; height: number } | null {
    if (
      bytes.length >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return { mime: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    if (
      bytes.length >= 30 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
      const chunk = bytes.toString('ascii', 12, 16);
      if (chunk === 'VP8X')
        return {
          mime: 'image/webp',
          width: 1 + bytes.readUIntLE(24, 3),
          height: 1 + bytes.readUIntLE(27, 3),
        };
      if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
        return {
          mime: 'image/webp',
          width: bytes.readUInt16LE(26) & 0x3fff,
          height: bytes.readUInt16LE(28) & 0x3fff,
        };
      if (chunk === 'VP8L' && bytes[20] === 0x2f) {
        const bits = bytes.readUInt32LE(21);
        return {
          mime: 'image/webp',
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
      return null;
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];
        if (
          [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
            marker,
          )
        ) {
          return {
            mime: 'image/jpeg',
            height: bytes.readUInt16BE(offset + 5),
            width: bytes.readUInt16BE(offset + 7),
          };
        }
        if (marker === 0xd8 || marker === 0xd9) {
          offset += 2;
          continue;
        }
        const segmentLength = bytes.readUInt16BE(offset + 2);
        if (segmentLength < 2) return null;
        offset += 2 + segmentLength;
      }
    }
    return null;
  }
}
