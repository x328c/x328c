import { createHash } from 'crypto';
import { parseCsv, RegulationImportService } from './regulation-import.service';

describe('RegulationImportService', () => {
  it('parses quoted commas, escaped quotes and multiline content with stable row locations', () => {
    const rows = parseCsv('title,content\r\n"道路,规则","第一行\n第二行"\r\n"引号""测试",正文');
    expect(rows).toEqual([
      ['title', 'content'],
      ['道路,规则', '第一行\n第二行'],
      ['引号"测试', '正文'],
    ]);
  });

  it('recognizes repeated upload tasks without creating a second task', async () => {
    const task = { id: 7n, admin_id: 1n, file_hash: 'hash', idempotency_key: 'key' };
    const prisma = {
      regulationImportTask: { findUnique: jest.fn().mockResolvedValue(task), findFirst: jest.fn() },
    };
    const service = new RegulationImportService(
      prisma as never,
      {} as never,
      {
        consume: jest.fn().mockResolvedValue({ allowed: true }),
      } as never,
    );
    jest.spyOn(service, 'detail').mockResolvedValue({ id: '7', duplicate: true } as never);
    const file = {
      buffer: Buffer.from('x'),
      originalname: 'regulations.csv',
      mimetype: 'text/csv',
      size: 1,
    };
    // The persisted key is a hash; return the same task with matching current file hash.
    task.file_hash = createHash('sha256').update(file.buffer).digest('hex');
    const result = await service.preview(file, 'same-key', {
      adminId: 1n,
      requestId: 'request',
      ipAddress: '127.0.0.1',
    });
    expect(result).toEqual({ id: '7', duplicate: true });
    expect(service.detail).toHaveBeenCalledWith(7n, 1n, 1, true);
  });

  it('rejects a header-only CSV instead of creating an empty import task', async () => {
    const prisma = {
      regulationImportTask: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new RegulationImportService(
      prisma as never,
      {} as never,
      {
        consume: jest.fn().mockResolvedValue({ allowed: true }),
      } as never,
    );
    const header =
      'title,document_no,document_no_empty_reason,issuer,authority_level,category,scope,regions,tags,source_url,published_at,effective_at,expired_at,effective_note,last_verified_at,review_cycle_days,replacement_regulation_id,summary,content,change_note\n';
    await expect(
      service.preview(
        {
          buffer: Buffer.from(header),
          originalname: 'empty.csv',
          mimetype: 'text/csv',
          size: Buffer.byteLength(header),
        },
        'header-only',
        { adminId: 1n, requestId: 'header-only-test', ipAddress: '127.0.0.1' },
      ),
    ).rejects.toThrow('CSV 文件没有可导入的数据行');
  });

  it('allows distinct appendix entries to share a document number', () => {
    const service = new RegulationImportService({} as never, {} as never, {} as never);
    const where = service['duplicateWhere']({
      title: '10051未取得驾驶证驾驶营运客车的',
      document_no: '新公规〔2025〕1号',
      document_no_empty_reason: null,
      issuer: '新疆维吾尔自治区公安厅',
      authority_level: 'local',
      category: 'traffic',
      scope: 'REGIONAL',
      regions: [{ region_code: '650000', region_name: '新疆维吾尔自治区' }],
      tags: ['自治区道路交通违法行为行政处罚裁量权基准'],
      source_url: 'https://gat.xinjiang.gov.cn/example',
      published_at: '2025-03-11',
      effective_at: '2025-04-15',
      expired_at: null,
      effective_note: '有效期五年',
      last_verified_at: '2026-08-08',
      review_cycle_days: 30,
      replacement_regulation_id: null,
      summary: '测试摘要',
      content: '测试正文',
      change_note: '测试导入',
    });
    expect(where).toEqual({
      deleted_at: null,
      normalized_title: '10051未取得驾驶证驾驶营运客车的',
      normalized_issuer: '新疆维吾尔自治区公安厅',
    });
    expect(where).not.toHaveProperty('normalized_document_no');
    expect(where).not.toHaveProperty('OR');
  });
});
