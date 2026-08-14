import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LOGIN_LEGAL_DOCUMENTS } from '../legal-documents.constants';
import { WxLoginDto } from './wx-login.dto';

const currentConsent = {
  accepted: true,
  bundle_version: LOGIN_LEGAL_DOCUMENTS.bundleVersion,
  user_agreement_hash: LOGIN_LEGAL_DOCUMENTS.userAgreementHash,
  privacy_policy_hash: LOGIN_LEGAL_DOCUMENTS.privacyPolicyHash,
  safety_notice_hash: LOGIN_LEGAL_DOCUMENTS.safetyNoticeHash,
};

describe('WxLoginDto legal consent', () => {
  it('accepts an explicit acknowledgement of the current document bundle', async () => {
    const dto = plainToInstance(WxLoginDto, { code: 'wx-code', legal_consent: currentConsent });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects login without legal consent', async () => {
    const dto = plainToInstance(WxLoginDto, { code: 'wx-code' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'legal_consent')).toBe(true);
  });

  it('rejects stale document hashes or an unchecked acknowledgement', async () => {
    const dto = plainToInstance(WxLoginDto, {
      code: 'wx-code',
      legal_consent: { ...currentConsent, accepted: false, privacy_policy_hash: '0'.repeat(64) },
    });
    const errors = await validate(dto);
    expect(
      errors.find((error) => error.property === 'legal_consent')?.children?.length,
    ).toBeGreaterThan(0);
  });
});
