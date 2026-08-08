import { Request } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithContext = Request & {
  requestId?: string;
  user?: {
    sub?: string;
    type?: string;
  };
};

export function getRequestId(request: Request): string {
  return (request as RequestWithContext).requestId ?? 'unknown';
}
