import { officialThroughQuery } from './route-through-query';

describe('official through-region query', () => {
  it('uses the coverage index first and keeps nullable primary regions in the through group', () => {
    const query = officialThroughQuery({ city_code: '650100', district_code: '650102' }, undefined, 21);
    expect(query.sql).toContain('FROM route_regions g STRAIGHT_JOIN routes r');
    expect(query.sql).toContain('AND NOT (r.city_code <=> ? AND r.district_code <=> ?)');
    expect(query.sql).toContain('SELECT DISTINCT r.id, r.sort_weight, r.updated_at');
    expect(query.values.at(-1)).toBe(21);
  });
  it('binds input and resumes the full weight/date/id ordering without unsafe interpolation', () => {
    const value = "650100' OR 1=1 --";
    const query = officialThroughQuery({ city_code: value, type: 'scenic' }, { sortWeight: 3, updatedAt: '2026-09-03T00:00:00Z', id: '123' }, 2);
    expect(query.sql).not.toContain(value);
    expect(query.values).toContain(value);
    expect(query.values).toContain(123n);
    expect(query.sql).toContain('ORDER BY r.sort_weight DESC, r.updated_at DESC, r.id DESC');
  });
});
