import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../redis/redis.service';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    setIfAbsent: jest.fn(),
    del: jest.fn(),
  } as unknown as RedisService;
  const service = new IdempotencyService(redis);
  const input = {
    scope: 'forum.create',
    actorKey: 'user:42',
    key: 'request-key-1234',
    payload: { boardId: '1', title: 'hello' },
  };

  beforeEach(() => jest.clearAllMocks());

  it('runs once and replays a completed result for the same request', async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce(null);
    (redis.setIfAbsent as jest.Mock).mockResolvedValue(true);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    const operation = jest.fn().mockResolvedValue({ id: '99' });

    await expect(service.execute(input, operation)).resolves.toEqual({
      value: { id: '99' },
      replayed: false,
    });
    const completed = (redis.set as jest.Mock).mock.calls[0][1] as string;
    (redis.get as jest.Mock).mockResolvedValueOnce(completed);

    await expect(service.execute(input, operation)).resolves.toEqual({
      value: { id: '99' },
      replayed: true,
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse with a different payload and fails closed without Redis', async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ fingerprint: 'different', status: 'completed', value: {} }),
    );
    await expect(service.execute(input, jest.fn())).rejects.toBeInstanceOf(AppException);

    (redis.get as jest.Mock).mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(service.execute(input, jest.fn())).rejects.toMatchObject({ status: 503 });
  });

  it('rejects an in-progress duplicate and releases its lock when the operation fails', async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce(null);
    (redis.setIfAbsent as jest.Mock).mockResolvedValueOnce(true);
    (redis.del as jest.Mock).mockResolvedValue(1);
    const failure = new Error('business failed');

    await expect(service.execute(input, () => Promise.reject(failure))).rejects.toBe(failure);
    const pending = (redis.setIfAbsent as jest.Mock).mock.calls[0][1] as string;
    expect(redis.del).toHaveBeenCalledTimes(1);

    (redis.get as jest.Mock).mockResolvedValueOnce(pending);
    await expect(service.execute(input, jest.fn())).rejects.toMatchObject({ status: 409 });
  });

  it('rejects invalid keys, corrupt cache records and a disappeared raced lock', async () => {
    await expect(service.execute({ ...input, key: '' }, jest.fn())).rejects.toMatchObject({
      status: 400,
    });

    (redis.get as jest.Mock).mockResolvedValueOnce('{broken-json');
    await expect(service.execute(input, jest.fn())).rejects.toMatchObject({ status: 503 });

    (redis.get as jest.Mock).mockResolvedValueOnce('null');
    await expect(service.execute(input, jest.fn())).rejects.toMatchObject({ status: 503 });

    (redis.get as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    (redis.setIfAbsent as jest.Mock).mockResolvedValueOnce(false);
    await expect(service.execute(input, jest.fn())).rejects.toMatchObject({ status: 503 });
  });

  it('supports canonical nested payloads and returns success if completion caching fails', async () => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.setIfAbsent as jest.Mock).mockResolvedValue(true);
    (redis.set as jest.Mock).mockRejectedValue(new Error('cache write failed'));

    await expect(
      service.execute(
        { ...input, payload: { values: [null, 2n, true], optional: undefined }, ttlSeconds: 30 },
        async () => ({ id: '100' }),
      ),
    ).resolves.toEqual({ value: { id: '100' }, replayed: false });
  });
});
