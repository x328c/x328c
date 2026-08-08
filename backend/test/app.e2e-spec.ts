import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { RequestIdMiddleware } from '../src/common/request/request-id.middleware';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const requestId = new RequestIdMiddleware();
    app.use(requestId.use.bind(requestId));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns the compatible response envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'health-request-1234')
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: 'success',
      data: {
        status: 'ok',
        service: 'jiangxing-backend',
        timestamp: expect.any(String),
      },
      timestamp: expect.any(String),
      requestId: 'health-request-1234',
    });
    expect(response.headers['x-request-id']).toBe('health-request-1234');
  });
});
