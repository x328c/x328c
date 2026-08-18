import { All, Controller, HttpStatus } from '@nestjs/common';
import { AppException } from './exceptions/app.exception';

@Controller()
export class RetiredFeaturesController {
  @All(['activities', 'activities/*', 'admin/activities', 'admin/activities/*'])
  activities(): never {
    throw this.retired();
  }

  @All(['forum', 'forum/*', 'admin/forum', 'admin/forum/*'])
  forum(): never {
    throw this.retired();
  }

  private retired(): AppException {
    return new AppException(
      57001,
      '该功能已于 V2.2 下线，请升级到最新版本',
      HttpStatus.GONE,
    );
  }
}
