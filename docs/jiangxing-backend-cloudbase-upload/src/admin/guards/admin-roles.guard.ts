import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { AdminJwtPayload } from '../entity/admin-token.entity';
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<number[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AdminJwtPayload }>().user;
    if (!user || !roles.includes(user.role)) throw new AppException(7003, '权限不足', 403);
    return true;
  }
}
