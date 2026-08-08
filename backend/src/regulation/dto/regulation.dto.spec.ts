import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BatchRegulationWorkflowDto, RegulationDraftDto } from './regulation.dto';

function draft(sourceUrl?: string) {
  return {
    title: '道路交通安全测试规定',
    document_no: '测试文号第1号',
    issuer: '测试发布机关',
    authority_level: 'local',
    category: 'traffic',
    scope: 'NATIONAL',
    regions: [],
    tags: ['道路安全'],
    ...(sourceUrl === undefined ? {} : { source_url: sourceUrl }),
    summary: '草稿摘要',
    content: '草稿正文',
    change_note: '创建待补充来源的草稿',
  };
}

describe('RegulationDraftDto', () => {
  it('allows a draft without source so publish-time completeness remains authoritative', () => {
    const errors = validateSync(plainToInstance(RegulationDraftDto, draft()));
    expect(errors).toHaveLength(0);
  });

  it('still rejects a non-HTTP source when a draft supplies one', () => {
    const errors = validateSync(plainToInstance(RegulationDraftDto, draft('javascript:alert(1)')));
    expect(errors.some((error) => error.property === 'source_url')).toBe(true);
  });
});

describe('BatchRegulationWorkflowDto', () => {
  const errorsFor = (ids: string[]) =>
    validateSync(plainToInstance(BatchRegulationWorkflowDto, { ids, reason: '批量工作流操作' }));

  it('accepts up to 100 unique positive regulation IDs', () => {
    expect(errorsFor(Array.from({ length: 100 }, (_, index) => String(index + 1)))).toHaveLength(0);
  });

  it.each([
    ['empty', []],
    ['duplicate', ['1', '1']],
    ['invalid', ['0', '-1', 'route']],
    ['over-limit', Array.from({ length: 101 }, (_, index) => String(index + 1))],
  ])('rejects %s ID collections', (_label, ids) => {
    expect(errorsFor(ids)).not.toHaveLength(0);
  });
});
