import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; timestamp: string; service: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'jiangxing-backend',
    };
  }
}
