import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AdminSafetyAgreementController } from './admin-safety-agreement.controller';
import { AdminSafetyGuideController } from './admin-safety-guide.controller';

describe('V2.1 safety administration roles', () => {
  const rolesFor = (target: object, method: string) =>
    Reflect.getMetadata(ROLES_KEY, Object.getOwnPropertyDescriptor(target, method)?.value);

  it('allows content creators and reviewers to discover guide records', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminSafetyGuideController)).toEqual([1, 2, 9]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminSafetyAgreementController)).toEqual([1, 2, 9]);
  });

  it('separates guide creation, review and publication permissions', () => {
    expect(rolesFor(AdminSafetyGuideController.prototype, 'create')).toEqual([1, 9]);
    expect(rolesFor(AdminSafetyGuideController.prototype, 'review')).toEqual([2, 9]);
    expect(rolesFor(AdminSafetyGuideController.prototype, 'publish')).toEqual([9]);
    expect(rolesFor(AdminSafetyGuideController.prototype, 'offline')).toEqual([9]);
  });

  it('separates agreement creation, review and publication permissions', () => {
    expect(rolesFor(AdminSafetyAgreementController.prototype, 'create')).toEqual([1, 9]);
    expect(rolesFor(AdminSafetyAgreementController.prototype, 'review')).toEqual([2, 9]);
    expect(rolesFor(AdminSafetyAgreementController.prototype, 'publish')).toEqual([9]);
  });
});
