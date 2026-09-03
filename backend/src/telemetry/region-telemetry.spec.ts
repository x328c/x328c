import { isRegionEvent, sanitizeRegionProperties } from './region-telemetry';

describe('region telemetry privacy boundary', () => {
  it('projects only the properties appropriate to the event', () => {
    expect(sanitizeRegionProperties('poi_city_map_success', {
      business: 'ride', city_code: '650100', match_type: 'exact', catalog_version: '2025-12-31',
      city: 'raw city', name: 'home', address: 'private address', latitude: 43.8, longitude: 87.6,
      previous_city_code: '652300', error: 'secret', user_id: '1',
    })).toEqual({ business: 'ride', city_code: '650100', match_type: 'exact', catalog_version: '2025-12-31' });
  });

  it('drops unsupported codes and free text even under allowed property names', () => {
    expect(sanitizeRegionProperties('poi_city_map_success', {
      business: 'private address', city_code: '659999', match_type: 'user secret', catalog_version: 'private data',
    })).toEqual({});
    expect(sanitizeRegionProperties('poi_choose_failed', { reason: 'contains coordinates' })).toEqual({});
    expect(sanitizeRegionProperties('region_submit_rejected', { error_code: 500 })).toEqual({});
    expect(sanitizeRegionProperties('poi_choose_success', { type: '2', has_city: 'yes' })).toEqual({});
  });

  it('keeps false flags and only recognizes registered region events', () => {
    expect(sanitizeRegionProperties('poi_region_manual_confirm', {
      business: 'user_route', city_code: '652300', previous_city_code: '650100', changed: true, district_selected: false,
    })).toEqual({ business: 'user_route', city_code: '652300', previous_city_code: '650100', changed: true, district_selected: false });
    expect(isRegionEvent('poi_choose_success')).toBe(true);
    expect(isRegionEvent('route_detail_view')).toBe(false);
    expect(isRegionEvent('poi_unknown')).toBe(false);
  });
});
