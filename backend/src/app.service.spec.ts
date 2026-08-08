import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get(AppService);
  });

  it('returns the current service health payload', () => {
    const result = service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('jiangxing-backend');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
