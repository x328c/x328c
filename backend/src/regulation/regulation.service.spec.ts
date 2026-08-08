import { RegulationService } from './regulation.service';
import { REGULATION_STATUS } from './regulation.constants';
import { normalizeDocumentNo, normalizeRegulationText } from './regulation-normalizer';

function row(id: number, title: string, documentNo: string, issuer: string, tags: string[]) {
  return {
    id: BigInt(id),
    title,
    normalized_title: normalizeRegulationText(title),
    document_no: documentNo,
    document_no_empty_reason: null,
    normalized_document_no: normalizeDocumentNo(documentNo),
    issuer,
    normalized_issuer: normalizeRegulationText(issuer),
    authority_level: id % 4 === 0 ? 'law' : 'local',
    category: 'traffic',
    scope: 'NATIONAL',
    status: REGULATION_STATUS.EFFECTIVE,
    source_url: `https://gov.example/${id}`,
    published_at: new Date('2025-01-01'),
    effective_at: new Date('2025-02-01'),
    expired_at: null,
    effective_note: null,
    last_verified_at: new Date('2026-07-01'),
    review_cycle_days: 90,
    current_revision_id: BigInt(100 + id),
    replacement_regulation_id: null,
    created_by: 1n,
    offlined_at: null,
    offline_reason: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date(`2026-07-${String(id).padStart(2, '0')}`),
    deleted_at: null,
    current_revision: {
      id: BigInt(100 + id),
      regulation_id: BigInt(id),
      version: 1,
      summary: `${title}摘要`,
      content: '正文',
      source_snapshot: {},
      change_note: '首次发布',
      status: 3,
      created_by: 1n,
      reviewed_by: 2n,
      reviewed_at: new Date(),
      published_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      reviewer: { id: 2n, username: 'reviewer' },
    },
    tag_links: tags.map((name, index) => ({
      regulation_id: BigInt(id),
      tag_id: BigInt(id * 10 + index),
      created_at: new Date(),
      tag: {
        id: BigInt(id * 10 + index),
        name,
        normalized_name: normalizeRegulationText(name),
        created_at: new Date(),
      },
    })),
    regions: [],
    replacement: null,
  };
}

describe('RegulationService', () => {
  const corpus = [
    row(1, '中华人民共和国道路交通安全法', '主席令第八号', '全国人民代表大会常务委员会', [
      '道路安全',
      '交通事故',
      '机动车',
    ]),
    row(2, '机动车驾驶证申领和使用规定', '公安部令第172号', '公安部', ['驾驶证', '驾照', '记分']),
    row(3, '机动车登记规定', '公安部令第164号', '公安部', ['车辆登记', '上牌', '过户']),
    row(4, '中华人民共和国道路交通安全法实施条例', '国务院令第405号', '国务院', [
      '交通规则',
      '实施条例',
      '限速',
    ]),
    row(5, '摩托车污染物排放限值及测量方法', 'GB 14622-2016', '生态环境部', [
      '摩托车排放',
      '环保标准',
      '国四',
    ]),
    row(6, '道路交通事故处理程序规定', '公安部令第146号', '公安部', [
      '事故处理',
      '责任认定',
      '交通事故',
    ]),
    row(7, '机动车强制报废标准规定', '商务部令2012年第12号', '商务部', [
      '强制报废',
      '报废年限',
      '机动车',
    ]),
    row(8, '城市道路管理条例', '国务院令第198号', '国务院', ['城市道路', '道路管理', '通行']),
    row(9, '新疆维吾尔自治区道路交通安全条例', '新疆人大公告第10号', '新疆维吾尔自治区人大常委会', [
      '新疆交通',
      '乌鲁木齐',
      '地方条例',
    ]),
    row(10, '浙江省实施道路交通安全法办法', '浙江省人大公告第52号', '浙江省人大常委会', [
      '浙江交通',
      '杭州',
      '地方规定',
    ]),
  ];
  const prisma = {
    regulation: { findMany: jest.fn(), findFirst: jest.fn() },
    regulationRevision: { findMany: jest.fn() },
    regulationFeedback: { create: jest.fn() },
  };
  const rateLimit = { consume: jest.fn().mockResolvedValue({ allowed: true }) };
  const service = new RegulationService(prisma as never, rateLimit as never);

  beforeEach(() => jest.clearAllMocks());

  it('defaults public lists to current effective entries', async () => {
    prisma.regulation.findMany.mockResolvedValue([]);
    await service.list({ limit: 20 });
    expect(prisma.regulation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: REGULATION_STATUS.EFFECTIVE,
          current_revision_id: { not: null },
        }),
      }),
    );
  });

  it('returns empty results and non-generative suggestions', async () => {
    prisma.regulation.findMany.mockResolvedValue([]);
    const result = await service.search({ keyword: '不存在的虚构答案', limit: 20 });
    expect(result.items).toEqual([]);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.disclaimer).toContain('不会自动生成答案');
  });

  it('records link failures with the still-visible source URL', async () => {
    prisma.regulation.findFirst.mockResolvedValue({ id: 1n, source_url: 'https://gov.example/1' });
    prisma.regulationFeedback.create.mockResolvedValue({
      id: 9n,
      status: 0,
      created_at: new Date('2026-08-01'),
    });
    await service.feedback(1n, 2n, { type: 'link_broken' });
    expect(prisma.regulationFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source_url: 'https://gov.example/1', type: 'link_broken' }),
      }),
    );
  });

  it('achieves >=90% Top3 on 30 real Chinese motorcycle-regulation queries', async () => {
    prisma.regulation.findMany.mockResolvedValue(corpus);
    const cases: Array<[string, number]> = [
      ['道路交通安全法', 1],
      ['主席令第八号', 1],
      ['道路安全', 1],
      ['驾驶证申领', 2],
      ['公安部令172号', 2],
      ['驾照记分', 2],
      ['机动车登记', 3],
      ['公安部令164号', 3],
      ['车辆上牌', 3],
      ['交通安全法实施条例', 4],
      ['国务院令405号', 4],
      ['交通规则', 4],
      ['摩托车排放', 5],
      ['GB14622', 5],
      ['环保标准', 5],
      ['事故处理程序', 6],
      ['公安部令146号', 6],
      ['责任认定', 6],
      ['强制报废', 7],
      ['商务部令2012年12号', 7],
      ['报废年限', 7],
      ['城市道路管理', 8],
      ['国务院令198号', 8],
      ['道路管理', 8],
      ['新疆交通安全条例', 9],
      ['乌鲁木齐', 9],
      ['新疆人大', 9],
      ['浙江交通安全法办法', 10],
      ['杭州地方规定', 10],
      ['浙江省人大', 10],
    ];
    let hits = 0;
    for (const [keyword, expected] of cases) {
      prisma.regulation.findMany.mockResolvedValueOnce(corpus);
      const result = await service.search({ keyword, limit: 20 });
      if (result.items.slice(0, 3).some((item) => item.id === String(expected))) hits += 1;
    }
    expect(hits / cases.length).toBeGreaterThanOrEqual(0.9);
  });
});
