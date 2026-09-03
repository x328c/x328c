import { AppException } from '../common/exceptions/app.exception';
import { RegionService } from './region.service';

describe('RegionService', () => {
  const service = new RegionService();

  it('returns versioned Xinjiang cities and districts', () => {
    const result = service.list('650000');
    const urumqi = result.cities.find((item) => item.code === '650100');

    expect(result.version).toBe('2025-12-31');
    expect(urumqi?.districts).toContainEqual({ code: '650102', name: '天山区' });
    expect(service.isSupported('653200', '653228')).toBe(true);
    expect(service.isSupported('659012', '659012')).toBe(true);
  });

  it('rejects unsupported provinces and mismatched districts', () => {
    expect(() => service.list('110000')).toThrow(AppException);
    expect(service.isSupported('650100', '653101')).toBe(false);
    expect(() => service.assertSupported(undefined)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 51122 }) }),
    );
    expect(() => service.assertSupported('110100')).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 51120 }) }),
    );
    expect(() => service.assertSupported('650100', '653101')).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 51121 }) }),
    );
  });
});
