import { formatStructuredLog, StructuredLoggerService } from './structured-logger.service';

describe('structured logging', () => {
  it('emits parseable JSON while removing tokens, identifiers, phone and bodies', () => {
    const line = formatStructuredLog('info', 'security_test', {
      request_id: 'request-1234',
      authorization: 'Bearer token-secret',
      nested: {
        openid: 'openid-secret',
        phone: '13800138000',
        body: 'post full text',
        content: 'regulation full text',
      },
      message: 'phone=13800138000 access_token=secret-value',
    });
    const payload = JSON.parse(line) as Record<string, unknown>;

    expect(payload).toMatchObject({
      level: 'info',
      event: 'security_test',
      request_id: 'request-1234',
    });
    for (const sensitive of [
      'token-secret',
      'openid-secret',
      '13800138000',
      'post full text',
      'regulation full text',
      'secret-value',
    ]) {
      expect(line).not.toContain(sensitive);
    }
    expect(line).toContain('[REDACTED]');
  });

  it('does not serialize stack-like optional logger arguments', () => {
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    new StructuredLoggerService().error(
      'moderation failed',
      'Error: request failed\nrequest body: post full text',
    );

    const line = String(write.mock.calls[0][0]);
    expect(line).toContain('moderation failed');
    expect(line).not.toContain('post full text');
    write.mockRestore();
  });
});
