import { ExecutionContext, Injectable } from '@nestjs/common';
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

  handleRequest<TUser>(_err: unknown, user: TUser): TUser | undefined {
    // 公开路线允许匿名访问。残留的过期令牌不应把公开接口变成 401；
    // 有效令牌仍会注入 request.user 以返回收藏等个性化状态。
    return user || undefined;
  }
}
