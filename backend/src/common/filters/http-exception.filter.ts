import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpException ? exception.getResponse() : undefined;
    const code =
      typeof payload === 'object' && payload !== null && 'code' in payload
        ? (payload as { code: number }).code
        : status;
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? (payload as { message: string | string[] }).message
        : isHttpException
          ? exception.message
          : '服务器内部错误';

    response.status(status).json({
      code,
      message: Array.isArray(message) ? message.join('; ') : message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
