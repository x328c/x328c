import axios from 'axios';
import { AuthService } from './auth.service';
import { LOGIN_LEGAL_DOCUMENTS } from './legal-documents.constants';

jest.mock('axios');

describe('AuthService wxLogin', () => {
  const account = {
    id: 7n,
    openid: 'openid-7',
    unionid: null,
    nickname: '新骑友',
    avatar_url: null,
    status: 1,
    role: 0,
    profile: { motorcycle_model: null, city_code: null },
  };
  const tx = {
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue(account),
    },
    legalAcceptance: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const jwt = {
    signAsync: jest.fn(async (payload: { tokenType: string }) =>
      payload.tokenType === 'access' ? 'access-token' : 'refresh-token',
    ),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'WECHAT_APP_ID') return 'app-id';
      if (key === 'WECHAT_APP_SECRET') return 'app-secret';
      return `${key}-value`;
    }),
    get: jest.fn((_key: string, defaultValue: string) => defaultValue),
  };
  const service = new AuthService(jwt as never, config as never, {} as never, prisma as never);
  const consent = {
    accepted: true as const,
    bundle_version: LOGIN_LEGAL_DOCUMENTS.bundleVersion,
    user_agreement_hash: LOGIN_LEGAL_DOCUMENTS.userAgreementHash,
    privacy_policy_hash: LOGIN_LEGAL_DOCUMENTS.privacyPolicyHash,
    safety_notice_hash: LOGIN_LEGAL_DOCUMENTS.safetyNoticeHash,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.get as jest.Mock).mockResolvedValue({
      data: { openid: 'openid-7', session_key: 'session-key' },
    });
    tx.user.upsert.mockResolvedValue(account);
  });

  it('marks an account created by the first real WeChat login as new', async () => {
    tx.user.findUnique.mockResolvedValue(null);

    await expect(service.wxLogin('wx-code', consent, 'request-1')).resolves.toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      is_new_user: true,
      user: { id: '7', nickname: '新骑友' },
    });
  });

  it('does not send an existing user through first-login onboarding again', async () => {
    tx.user.findUnique.mockResolvedValue({ id: account.id });

    await expect(service.wxLogin('wx-code', consent, 'request-2')).resolves.toMatchObject({
      is_new_user: false,
    });
  });
});
