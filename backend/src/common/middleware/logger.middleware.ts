import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { StructuredLoggerService } from '../logging/structured-logger.service';
import { MetricsService } from '../observability/metrics.service';
import { getRequestId, RequestWithContext } from '../request/request-context';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: StructuredLoggerService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    response.on('finish', () => {
      const actor = (request as RequestWithContext).user;
      this.logger.http({
        request_id: getRequestId(request),
        method: request.method,
        route: request.route?.path ?? request.path,
        status_code: response.statusCode,
        duration_ms: Date.now() - startedAt,
        ...(actor?.type === 'admin' && actor.sub ? { admin_id: actor.sub } : {}),
        ...(actor?.type !== 'admin' && actor?.sub ? { user_id: actor.sub } : {}),
        ...(response.locals.errorCode ? { error_code: response.locals.errorCode } : {}),
      });
      this.metrics?.recordHttp(
        `${request.method} ${request.route?.path ?? request.path}`,
        response.statusCode,
        Date.now() - startedAt,
      );
    });
    next();
  }
}
