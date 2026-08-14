import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LOGIN_LEGAL_DOCUMENTS } from './legal-documents.constants';

const digest = (filename: string) =>
  createHash('sha256')
    .update(
      readFileSync(resolve(__dirname, '..', '..', '..', 'docs', 'V2.1文档', '合规文档', filename)),
    )
    .digest('hex');

describe('LOGIN_LEGAL_DOCUMENTS', () => {
  it('uses hashes matching the exact documents displayed by the mini program', () => {
    expect(LOGIN_LEGAL_DOCUMENTS.userAgreementHash).toBe(digest('用户协议.md'));
    expect(LOGIN_LEGAL_DOCUMENTS.privacyPolicyHash).toBe(digest('隐私政策.md'));
    expect(LOGIN_LEGAL_DOCUMENTS.safetyNoticeHash).toBe(digest('安全须知.md'));
  });
});
