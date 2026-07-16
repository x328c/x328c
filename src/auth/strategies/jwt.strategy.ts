import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TOKEN_BLACKLIST_PREFIX, ACCESS_TOKEN_TYPE } from '../../common/constants/auth.constants';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtPayload } from '../entity/auth-token.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.tokenType !== ACCESS_TOKEN_TYPE) throw new UnauthorizedException('无效的访问令牌');
    if (await this.redisService.get(`${TOKEN_BLACKLIST_PREFIX}${payload.jti}`)) {
      throw new UnauthorizedException('令牌已失效');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(payload.sub), status: 1, deleted_at: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('用户不存在或已被禁用');
    return payload;
  }
}
