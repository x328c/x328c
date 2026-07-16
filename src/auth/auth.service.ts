import { HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import {
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
  TOKEN_BLACKLIST_PREFIX,
} from '../common/constants/auth.constants';
import { RedisService } from '../common/redis/redis.service';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthTokens, JwtPayload } from './entity/auth-token.entity';

interface WechatCode2SessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export interface WxLoginResult extends AuthTokens {
  user: {
    id: string;
    nickname: string;
    avatar_url: string | null;
    role: number;
    profile: { motorcycle_model: string | null; city_code: string | null } | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async wxLogin(code: string): Promise<WxLoginResult> {
    const wechatSession = await this.getWechatSession(code);
    const now = new Date();
    const user = await this.prisma.user.upsert({
      where: { openid: wechatSession.openid },
      create: {
        openid: wechatSession.openid,
        unionid: wechatSession.unionid,
        nickname: '新骑友',
        last_login_at: now,
        profile: { create: {} },
      },
      update: {
        unionid: wechatSession.unionid,
        last_login_at: now,
        deleted_at: null,
      },
      include: { profile: true },
    });
    if (user.status !== 1) {
      throw new AppException(2001, '用户已被禁用', HttpStatus.UNAUTHORIZED);
    }
    const tokens = await this.issueTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        role: user.role,
        profile: user.profile
          ? {
              motorcycle_model: user.profile.motorcycle_model,
              city_code: user.profile.city_code,
            }
          : null,
      },
    };
  }

  async issueTokens(userId: bigint, role: number): Promise<AuthTokens> {
    const accessPayload: JwtPayload = {
      sub: userId.toString(),
      role,
      tokenType: ACCESS_TOKEN_TYPE,
      jti: randomUUID(),
    };
    const refreshPayload: JwtPayload = {
      sub: userId.toString(),
      role,
      tokenType: REFRESH_TOKEN_TYPE,
      jti: randomUUID(),
    };
    const access_token = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '2h'),
    });
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    return { access_token, refresh_token };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new AppException(1002, '刷新令牌无效或已过期', HttpStatus.UNAUTHORIZED);
    }
    if (payload.tokenType !== REFRESH_TOKEN_TYPE) {
      throw new AppException(1002, '无效的刷新令牌', HttpStatus.UNAUTHORIZED);
    }
    if (await this.redisService.get(`${TOKEN_BLACKLIST_PREFIX}${payload.jti}`)) {
      throw new AppException(1002, '刷新令牌已失效', HttpStatus.UNAUTHORIZED);
    }
    await this.assertActiveUser(payload.sub);
    await this.blacklist(payload);
    return this.issueTokens(BigInt(payload.sub), payload.role);
  }

  async logout(payload: JwtPayload, refreshToken?: string): Promise<void> {
    await this.blacklist(payload);
    if (!refreshToken) return;
    try {
      const refreshPayload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });
      if (
        refreshPayload.tokenType === REFRESH_TOKEN_TYPE &&
        refreshPayload.sub === payload.sub &&
        !(await this.redisService.get(`${TOKEN_BLACKLIST_PREFIX}${refreshPayload.jti}`))
      ) {
        await this.blacklist(refreshPayload);
      }
    } catch {
      // Access Token 已有效验证；损坏或过期 Refresh Token 不应阻止登出。
    }
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(userId), status: 1, deleted_at: null },
      select: { id: true },
    });
    if (!user) throw new AppException(2001, '用户不存在或已被禁用', HttpStatus.UNAUTHORIZED);
  }

  private async blacklist(payload: JwtPayload): Promise<void> {
    const ttl = payload.exp ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 1) : 1;
    await this.redisService.set(`${TOKEN_BLACKLIST_PREFIX}${payload.jti}`, '1', ttl);
  }

  private async getWechatSession(
    code: string,
  ): Promise<Required<Pick<WechatCode2SessionResponse, 'openid'>> & WechatCode2SessionResponse> {
    let response: WechatCode2SessionResponse;
    try {
      const result = await axios.get<WechatCode2SessionResponse>(
        'https://api.weixin.qq.com/sns/jscode2session',
        {
          params: {
            appid: this.configService.getOrThrow<string>('WECHAT_APP_ID'),
            secret: this.configService.getOrThrow<string>('WECHAT_APP_SECRET'),
            js_code: code,
            grant_type: 'authorization_code',
          },
          timeout: 10_000,
        },
      );
      response = result.data;
    } catch {
      throw new AppException(9001, '微信登录服务暂时不可用', HttpStatus.BAD_GATEWAY);
    }

    if (response.errcode || !response.openid || !response.session_key) {
      throw new AppException(1002, response.errmsg || '微信登录凭证无效', HttpStatus.UNAUTHORIZED);
    }
    return response as Required<Pick<WechatCode2SessionResponse, 'openid'>> &
      WechatCode2SessionResponse;
  }
}
