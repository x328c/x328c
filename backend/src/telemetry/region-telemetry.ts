import { XINJIANG_CITIES } from '../region/xinjiang-regions';

export const REGION_EVENT_NAMES = [
  'poi_choose_success',
  'poi_choose_failed',
  'poi_city_map_success',
  'poi_city_map_failed',
  'poi_region_manual_confirm',
  'region_submit_rejected',
] as const;

const cityCodes = new Set(XINJIANG_CITIES.map((city) => city.code));
const fields: Record<string, readonly string[]> = {
  poi_choose_success: ['business', 'type', 'has_city', 'catalog_version'],
  poi_choose_failed: ['business', 'reason', 'catalog_version'],
  poi_city_map_success: ['business', 'city_code', 'match_type', 'catalog_version'],
  poi_city_map_failed: ['business', 'reason', 'catalog_version'],
  poi_region_manual_confirm: ['business', 'city_code', 'previous_city_code', 'changed', 'district_selected', 'catalog_version'],
  region_submit_rejected: ['business', 'error_code', 'catalog_version'],
};

export function isRegionEvent(name: string): boolean {
  return (REGION_EVENT_NAMES as readonly string[]).includes(name);
}

// Never persist raw city text, POI names, coordinates, addresses or errors.
export function sanitizeRegionProperties(name: string, input: Record<string, unknown>) {
  const output: Record<string, string | number | boolean> = {};
  for (const key of fields[name] ?? []) {
    const value = input[key];
    const allowed =
      (key === 'business' && ['ride', 'user_route'].includes(String(value))) ||
      (key === 'type' && [0, 1, 2].includes(value as number)) ||
      (['has_city', 'changed', 'district_selected'].includes(key) && typeof value === 'boolean') ||
      (['city_code', 'previous_city_code'].includes(key) && typeof value === 'string' && cityCodes.has(value)) ||
      (key === 'match_type' && ['exact', 'alias'].includes(String(value))) ||
      (key === 'reason' && ['cancel', 'unsupported', 'permission', 'other', 'empty', 'unmatched'].includes(String(value))) ||
      (key === 'error_code' && [51120, 51121, 51122, 51123, 51124].includes(value as number)) ||
      (key === 'catalog_version' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
    if (allowed && ['string', 'number', 'boolean'].includes(typeof value))
      output[key] = value as string | number | boolean;
  }
  return output;
}
