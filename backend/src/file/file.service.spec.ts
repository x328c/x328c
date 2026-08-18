import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { FileService } from './file.service';

describe('FileService user-content image verification', () => {
  const config = { getOrThrow: jest.fn(), get: jest.fn() } as unknown as ConfigService;
  const prisma = { fileRecord: { upsert: jest.fn() } } as unknown as PrismaService;
  const service = new FileService(config, prisma);
  const key = 'route-comments/2026/08/01/1/123e4567-e89b-12d3-a456-426614174000.png';
  const url = `https://bucket.cos.ap-guangzhou.myqcloud.com/${key}`;

  beforeEach(() => {
    jest.clearAllMocks();
    (config.getOrThrow as jest.Mock).mockImplementation(
      (name: string) =>
        ({ COS_BUCKET: 'bucket', COS_REGION: 'ap-guangzhou', COS_CDN_DOMAIN: 'cdn.example.com' })[
          name
        ],
    );
    (prisma.fileRecord.upsert as jest.Mock).mockResolvedValue({
      id: 1n,
      file_key: key,
      cdn_url: `https://cdn.example.com/${key}`,
    });
  });

  it('accepts a matching PNG file header with safe dimensions', async () => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(800, 16);
    bytes.writeUInt32BE(600, 20);
    jest.spyOn(axios, 'get').mockResolvedValue({ data: bytes } as never);
    await expect(
      service.recordUpload(1n, {
        file_key: key,
        file_url: url,
        file_size: 1000,
        file_type: 'image/png',
      }),
    ).resolves.toMatchObject({ id: '1' });
  });

  it('rejects a spoofed MIME or malicious file header', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: Buffer.from('<script>alert(1)</script>') } as never);
    await expect(
      service.recordUpload(1n, {
        file_key: key,
        file_url: url,
        file_size: 1000,
        file_type: 'image/png',
      }),
    ).rejects.toThrow('文件头');
  });

  it('accepts a verified route-comment image owned by the current user', async () => {
    const routeCommentKey =
      'route-comments/2026/08/12/1/' + '123e4567-e89b-12d3-a456-426614174001.png';
    const routeCommentUrl = `https://bucket.cos.ap-guangzhou.myqcloud.com/${routeCommentKey}`;
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(1200, 16);
    bytes.writeUInt32BE(900, 20);
    jest.spyOn(axios, 'get').mockResolvedValue({ data: bytes } as never);
    await expect(
      service.recordUpload(1n, {
        file_key: routeCommentKey,
        file_url: routeCommentUrl,
        file_size: 2000,
        file_type: 'image/png',
      }),
    ).resolves.toMatchObject({ id: '1' });
  });
});
