import { Injectable, LoggerService } from '@nestjs/common';
import { sanitizeLogMetadata, sanitizeLogValue } from './log-sanitizer';

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export function formatStructuredLog(
  level: StructuredLogLevel,
  event: string,
  metadata: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    ...sanitizeLogMetadata(metadata),
    timestamp: new Date().toISOString(),
    level,
    event,
  });
}

function safeContext(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)
    ? value
    : undefined;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  http(metadata: Record<string, unknown>): void {
    this.emit('info', 'http_request', metadata);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emitApplication('info', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emitApplication('warn', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emitApplication('error', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emitApplication('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emitApplication('debug', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emitApplication('fatal', message, optionalParams);
  }

  private emitApplication(
    level: StructuredLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const context = safeContext(optionalParams.at(-1));
    this.emit(level, 'application', {
      message: sanitizeLogValue(message),
      ...(context ? { context } : {}),
    });
  }

  private emit(level: StructuredLogLevel, event: string, metadata: Record<string, unknown>): void {
    const line = `${formatStructuredLog(level, event, metadata)}\n`;
    if (level === 'error' || level === 'fatal') process.stderr.write(line);
    else process.stdout.write(line);
  }
}
