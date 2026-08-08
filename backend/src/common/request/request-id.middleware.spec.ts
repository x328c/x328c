import { Request, Response } from 'express';
import { RequestWithContext } from './request-context';
import { RequestIdMiddleware, resolveRequestId } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('passes through a valid request ID and returns it as a response header', () => {
    const request = { headers: { 'x-request-id': 'edge-request-1234' } } as unknown as Request;
    const response = {
      locals: {},
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    new RequestIdMiddleware().use(request, response, next);

    expect((request as RequestWithContext).requestId).toBe('edge-request-1234');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'edge-request-1234');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID instead of accepting malformed or injectable values', () => {
    expect(resolveRequestId('bad\nheader')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(resolveRequestId('short')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
