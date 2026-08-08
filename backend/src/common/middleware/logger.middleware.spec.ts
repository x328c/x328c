import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { StructuredLoggerService } from '../logging/structured-logger.service';
import { MetricsService } from '../observability/metrics.service';
import { LoggerMiddleware } from './logger.middleware';

describe('LoggerMiddleware', () => {
  it('logs only structured request metadata and never reads headers, query or body', () => {
    const logger = { http: jest.fn() } as unknown as StructuredLoggerService;
    const metrics = new MetricsService();
    const middleware = new LoggerMiddleware(logger, metrics);
    const request = {
      method: 'POST',
      path: '/api/v1/forum/posts',
      headers: { authorization: 'Bearer secret-token' },
      query: { phone: '13800138000' },
      body: { content: 'post full text', openid: 'openid-secret' },
      requestId: 'request-1234',
      user: { sub: '42', type: 'user' },
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      statusCode: 429,
      locals: { errorCode: 42901 },
    }) as unknown as Response;

    middleware.use(request, response, jest.fn());
    (response as unknown as EventEmitter).emit('finish');

    expect(logger.http).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'request-1234',
        method: 'POST',
        route: '/api/v1/forum/posts',
        status_code: 429,
        user_id: '42',
        error_code: 42901,
      }),
    );
    const logged = JSON.stringify((logger.http as jest.Mock).mock.calls[0][0]);
    expect(logged).not.toContain('secret-token');
    expect(logged).not.toContain('13800138000');
    expect(logged).not.toContain('post full text');
    expect(logged).not.toContain('openid-secret');
    expect(metrics.snapshot().api[0]).toEqual(expect.objectContaining({ requests: 1 }));
  });
});
