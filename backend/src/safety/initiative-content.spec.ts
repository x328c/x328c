import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatSafeRidingInitiativeText,
  parseSafeRidingInitiativeText,
} from './initiative-content';

describe('safe riding initiative text format', () => {
  const source = readFileSync(resolve(process.cwd(), 'content/safe-riding-initiative.md'), 'utf8');

  it('imports the V2.2 content draft into a stable display structure', () => {
    const content = parseSafeRidingInitiativeText(source);
    expect(content.schema).toBe('safe_riding_initiative/v1');
    expect(content.sections).toHaveLength(10);
    expect(content.sections[0]).toMatchObject({ order: 1, title: '合法驾驶，证照和车辆状态先确认' });
    expect(content.sources).toHaveLength(5);
    expect(content.sources.every((sourceItem) => sourceItem.url.startsWith('https://'))).toBe(true);
  });

  it('formats structured content back into editable text', () => {
    const text = formatSafeRidingInitiativeText(parseSafeRidingInitiativeText(source));
    expect(text).toContain('## 正文');
    expect(text).toContain('### 10、文明骑行，共同维护公共道路安全');
    expect(text).toContain('## 来源与编制依据');
    expect(parseSafeRidingInitiativeText(text ?? '').sections[0].title).toBe('合法驾驶，证照和车辆状态先确认');
  });

  it('keeps the deployable content source aligned with the V2.2 document', () => {
    const documentSource = readFileSync(
      resolve(process.cwd(), '../docs/V2.2文档/2.2.2/安全骑行倡议内容稿.md'),
      'utf8',
    );
    expect(parseSafeRidingInitiativeText(source)).toEqual(parseSafeRidingInitiativeText(documentSource));
  });
});
