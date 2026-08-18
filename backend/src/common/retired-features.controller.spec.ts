import { HttpStatus } from '@nestjs/common';
import { RetiredFeaturesController } from './retired-features.controller';

describe('RetiredFeaturesController', () => {
  const controller = new RetiredFeaturesController();
  it.each(['activities', 'forum'] as const)('returns the V2.2 retirement contract for %s', (method) => {
    try { controller[method](); throw new Error('expected retirement error'); }
    catch (error) {
      expect(error).toMatchObject({ status: HttpStatus.GONE });
      expect((error as { getResponse(): unknown }).getResponse()).toEqual({ code: 57001, message: '该功能已于 V2.2 下线，请升级到最新版本' });
    }
  });
});
