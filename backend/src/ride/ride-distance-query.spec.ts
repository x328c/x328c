import { rideDistanceQueries } from './ride-distance-query';

describe('distance query construction', () => {
  it('uses the same indexed region order without returning a false zero distance when location is absent', () => {
    const { page } = rideDistanceQueries({ city_code: '650100' });
    expect(page.sql).toContain('NULL AS distance_km');
    expect(page.values).not.toContain(undefined);
  });
  it('binds all input and places LIMIT after stable region/distance ordering', () => {
    const malicious = "650100' OR 1=1 --";
    const { page, count } = rideDistanceQueries({
      city_code: malicious,
      district_code: '650102',
      latitude: 43.8,
      longitude: 87.6,
      radius: 10,
      page: 3,
      pageSize: 20,
    });
    expect(page.sql).not.toContain(malicious);
    expect(page.values).toContain(malicious);
    expect(page.values.slice(-2)).toEqual([20, 40]);
    expect(page.sql).toContain(
      'ORDER BY region_rank ASC, distance_km ASC, r.created_at DESC, r.id DESC',
    );
    expect(page.sql).toContain('UNION');
    expect(page.sql).toContain('STRAIGHT_JOIN rides r ON r.id = candidates.id');
    expect(page.sql).toContain('r.deleted_at IS NULL');
    expect(count.sql).toContain('COUNT(*) AS total');
    expect(count.sql).not.toContain('LIMIT');
  });
  it('avoids computing distances for the count when no radius is requested', () => {
    const { count } = rideDistanceQueries({ latitude: 43.8, longitude: 87.6 });
    expect(count.sql).not.toContain('ASIN');
  });
});
