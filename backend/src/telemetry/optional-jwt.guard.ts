import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class OptionalTelemetryJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const authorization = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>().headers.authorization;
    return authorization ? super.canActivate(context) : true;
  }

  handleRequest<TUser>(_error: unknown, user: TUser): TUser | undefined {
    return user || undefined;
  }
}
