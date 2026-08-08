export function normalizeRegulationText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function normalizeDocumentNo(value: string): string {
  return normalizeRegulationText(value).replace(/[第号]/g, '');
}

export function normalizedDocumentKey(
  documentNo: string | undefined,
  title: string,
  issuer: string,
): string {
  return [
    documentNo ? normalizeDocumentNo(documentNo) : '',
    normalizeRegulationText(title),
    normalizeRegulationText(issuer),
  ].join(':');
}
