import { SafetyGuideService } from './safety-guide.service';

describe('SafetyGuideService safe riding initiative', () => {
  const actor = { adminId: 1n, requestId: 'initiative-test', ipAddress: '127.0.0.1' };
  const base = {
    code: 'safe_riding_initiative', title: '安全骑行倡议', summary: '安全骑行', version: '2026.08.1',
    source_title: '道路交通安全法', source_url: 'https://www.npc.gov.cn/', source_issuer: '全国人大常委会',
    content_note: '首版倡议', last_verified_at: '2026-08-16',
  };

  it('requires non-empty sections and HTTPS sources', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new SafetyGuideService(prisma as never, {} as never, {} as never);
    await expect(service.createRevision({ ...base, content_json: { sections: [], sources: [{ title: '来源', url: 'http://example.com' }] } }, actor)).rejects.toThrow('安全骑行倡议章节或 HTTPS 来源结构无效');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts plain-text sections and at least one HTTPS source', async () => {
    const tx = {
      safetyGuideArticle: { upsert: jest.fn().mockResolvedValue({ id: 2n }) },
      safetyGuideRevision: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 3n }) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const logs = { appendWithClient: jest.fn().mockResolvedValue({ id: '4' }) };
    const service = new SafetyGuideService(prisma as never, {} as never, logs as never);
    await expect(service.createRevision({ ...base, content_json: {
      schema: 'safe_riding_initiative/v1',
      intro: '安全骑行，从出发前检查开始。',
      disclaimer: '一般安全提示，不替代现行法律法规。',
      sections: [{ order: 1, title: '出发前', body: '检查车辆和护具，不酒驾。' }],
      sources: [{ title: '道路交通安全法', url: 'https://www.npc.gov.cn/', description: '安全驾驶相关规定。' }],
    } }, actor)).resolves.toMatchObject({ id: '3', article_id: '2' });
    expect(logs.appendWithClient).toHaveBeenCalled();
  });
});
