import 'reflect-metadata';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AdminRegulationController } from './admin-regulation.controller';

describe('AdminRegulationController role boundaries', () => {
  const rolesFor = (method: keyof AdminRegulationController): number[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, AdminRegulationController.prototype[method]);

  it('allows reviewers to read regulations and perform review', () => {
    expect(rolesFor('list')).toEqual([1, 2, 9]);
    expect(rolesFor('detail')).toEqual([1, 2, 9]);
    expect(rolesFor('review')).toEqual([2, 9]);
    expect(rolesFor('batchReview')).toEqual([2, 9]);
  });

  it('keeps create and update on the controller owner/admin boundary', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminRegulationController)).toEqual([1, 9]);
    expect(rolesFor('create')).toBeUndefined();
    expect(rolesFor('update')).toBeUndefined();
  });

  it('keeps publishing restricted to super administrators', () => {
    expect(rolesFor('publish')).toEqual([9]);
    expect(rolesFor('batchPublish')).toEqual([9]);
  });

  it('keeps permanent deletion restricted to super administrators', () => {
    expect(rolesFor('delete')).toEqual([9]);
    expect(rolesFor('batchDelete')).toEqual([9]);
  });

  it('allows owners and super administrators to batch-submit drafts', () => {
    expect(rolesFor('batchSubmitReview')).toEqual([1, 9]);
  });

  it('registers static batch routes before the dynamic id route', () => {
    const methods = Object.getOwnPropertyNames(AdminRegulationController.prototype);
    expect(methods.indexOf('batchSubmitReview')).toBeLessThan(methods.indexOf('detail'));
    expect(methods.indexOf('batchReview')).toBeLessThan(methods.indexOf('detail'));
    expect(methods.indexOf('batchPublish')).toBeLessThan(methods.indexOf('detail'));
    expect(methods.indexOf('batchDelete')).toBeLessThan(methods.indexOf('detail'));
  });
});
