import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/exceptions/app.exception';
import { AdminRolesGuard } from './admin-roles.guard';

function createContext(role?: number): ExecutionContext {
  const request = role === undefined ? {} : { user: { role } };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminRolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const guard = new AdminRolesGuard({ getAllAndOverride } as unknown as Reflector);

  beforeEach(() => {
    getAllAndOverride.mockReset();
  });

  it('allows access when no roles are required', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows an administrator with a required role', () => {
    getAllAndOverride.mockReturnValue([1, 9]);

    expect(guard.canActivate(createContext(9))).toBe(true);
  });

  it.each([undefined, 2])('rejects a missing or unsupported role (%s)', (role) => {
    getAllAndOverride.mockReturnValue([1, 9]);

    try {
      guard.canActivate(createContext(role));
      throw new Error('Expected AdminRolesGuard to reject access');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(403);
      expect((error as AppException).getResponse()).toEqual({ code: 7003, message: '权限不足' });
    }
  });
});
