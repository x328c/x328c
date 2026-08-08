import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppException } from '../src/common/exceptions/app.exception';
import { FeatureFlagGuard } from '../src/common/feature-flag/feature-flag.guard';
import { RequireFeatureFlag } from '../src/common/feature-flag/feature-flag.decorator';
import { FeatureFlagService } from '../src/common/feature-flag/feature-flag.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { RequestIdMiddleware } from '../src/common/request/request-id.middleware';

@Controller('foundation-test')
class FoundationTestController {
  @Get('ok') ok() {
    return { stable: true };
  }

  @Get('error') error() {
    throw new AppException(40099, '兼容错误');
  }

  @Get('controlled')
  @RequireFeatureFlag('forum.enabled')
  @UseGuards(FeatureFlagGuard)
  controlled() {
    return { shouldNeverBePublic: true };
  }
}

describe('request foundation (integration)', () => {
  let app: INestApplication;
  const flags = { assertEnabled: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FoundationTestController],
      providers: [Reflector, FeatureFlagGuard, { provide: FeatureFlagService, useValue: flags }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const requestId = new RequestIdMiddleware();
    app.use(requestId.use.bind(requestId));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformResponseInterceptor());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('returns the same request ID in headers and the compatible success envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/foundation-test/ok')
      .set('x-request-id', 'edge-request-1234')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('edge-request-1234');
    expect(response.body).toEqual({
      code: 0,
      message: 'success',
      data: { stable: true },
      timestamp: expect.any(String),
      requestId: 'edge-request-1234',
    });
  });

  it('preserves existing error fields and adds requestId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/foundation-test/error')
      .set('x-request-id', 'edge-request-5678')
      .expect(400);

    expect(response.body).toEqual({
      code: 40099,
      message: '兼容错误',
      data: null,
      timestamp: expect.any(String),
      path: '/api/v1/foundation-test/error',
      requestId: 'edge-request-5678',
    });
  });

  it('stably rejects a controlled handler when its feature flag is closed', async () => {
    flags.assertEnabled.mockRejectedValue(new AppException(52001, '功能暂未开放', 503));

    const response = await request(app.getHttpServer())
      .get('/api/v1/foundation-test/controlled')
      .expect(503);

    expect(response.body).toMatchObject({ code: 52001, message: '功能暂未开放' });
    expect(response.body.data).toBeNull();
    expect(response.body.requestId).toEqual(expect.any(String));
  });
});
