import { AppException } from '../common/exceptions/app.exception';

export interface SafeRidingInitiativeContent {
  schema: 'safe_riding_initiative/v1';
  intro: string;
  sections: Array<{ order: number; title: string; body: string }>;
  sources: Array<{ title: string; url: string; description: string }>;
  disclaimer: string;
}

const clean = (value: string) => value.replace(/\r\n/g, '\n').trim();

export function parseSafeRidingInitiativeText(input: string): SafeRidingInitiativeContent {
  const text = clean(input);
  if (!text) throw new AppException(55005, '安全骑行倡议正文不能为空');

  const summaryMatch = text.match(/##\s*摘要\s*\n([\s\S]*?)(?=\n##\s*正文)/);
  const bodyMatch = text.match(/##\s*正文\s*\n([\s\S]*?)(?=\n##\s*来源与编制依据)/);
  const sourcesMatch = text.match(/##\s*来源与编制依据\s*\n([\s\S]*?)(?=\n##\s*后台发布提示|$)/);
  if (!summaryMatch || !bodyMatch || !sourcesMatch) {
    throw new AppException(55005, '倡议文本需包含“摘要、正文、来源与编制依据”三个部分');
  }

  const sections = [...bodyMatch[1].matchAll(/###\s*(?:(?:[一二三四五六七八九十]+|\d+)[、.]\s*)?([^\n]+)\n([\s\S]*?)(?=\n###\s*|$)/g)].map(
    (match, index) => ({ order: index + 1, title: clean(match[1]), body: clean(match[2]) }),
  );
  const sources = [...sourcesMatch[1].matchAll(/^\d+\.\s*\[([^\]]+)]\((https:\/\/[^)]+)\)[：:]\s*(.+)$/gm)].map(
    (match) => ({ title: clean(match[1]), url: match[2], description: clean(match[3]) }),
  );
  if (sections.length !== 10 || sources.length === 0) {
    throw new AppException(55005, '倡议正文应包含 10 个章节及至少 1 条 HTTPS 来源');
  }

  return {
    schema: 'safe_riding_initiative/v1',
    intro: clean(summaryMatch[1]),
    sections,
    sources,
    disclaimer: '本倡议为一般安全提示，不替代法律法规、交通标志、公安交管指令或专业意见。',
  };
}

export function formatSafeRidingInitiativeText(content: unknown): string | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const value = content as Partial<SafeRidingInitiativeContent>;
  if (value.schema !== 'safe_riding_initiative/v1' || !Array.isArray(value.sections) || !Array.isArray(value.sources)) return null;
  return [
    '## 摘要',
    '',
    value.intro ?? '',
    '',
    '## 正文',
    '',
    ...value.sections.flatMap((section) => [`### ${section.order}、${section.title}`, '', section.body, '']),
    '## 来源与编制依据',
    '',
    ...value.sources.map((source, index) => `${index + 1}. [${source.title}](${source.url})：${source.description}`),
  ].join('\n').trim();
}
