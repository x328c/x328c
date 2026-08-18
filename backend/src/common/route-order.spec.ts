import { RegulationController } from '../regulation/regulation.controller';
import { RouteController } from '../route/route.controller';
import { RouteCommentController } from '../route/route-comment.controller';
import { SafetyAgreementController } from '../safety/safety-agreement.controller';

function methods(controller: object): string[] {
  return Object.getOwnPropertyNames(controller).filter((name) => name !== 'constructor');
}

describe('V2 static route ordering', () => {
  it('declares regulation search before the dynamic detail route', () => {
    const names = methods(RegulationController.prototype);
    expect(names.indexOf('search')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('search')).toBeLessThan(names.indexOf('detail'));
  });

  it('keeps V2.1 static mine and active routes explicit', () => {
    expect(methods(RouteCommentController.prototype).indexOf('mine')).toBeGreaterThanOrEqual(0);
    expect(methods(SafetyAgreementController.prototype).indexOf('active')).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('keeps route related-rides ahead of the dynamic detail handler', () => {
    const names = methods(RouteController.prototype);
    expect(names.indexOf('relatedRides')).toBeLessThan(names.indexOf('detail'));
  });
});
