import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const authorization = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>().headers.authorization;
    if (!authorization) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || info || !user) throw err ?? new UnauthorizedException('无效的访问令牌');
    return user;
  }
}
