import type { AxiosRequestConfig } from 'axios';
import { request } from './request';

export type RegionBusiness = 'ride' | 'user_route';
type RegionEvent = 'poi_choose_success' | 'poi_choose_failed' | 'poi_city_map_success' | 'poi_city_map_failed' | 'poi_region_manual_confirm' | 'region_submit_rejected';

export interface RegionEventProperties {
  business: RegionBusiness;
  type?: number;
  has_city?: boolean;
  city_code?: string;
  previous_city_code?: string;
  changed?: boolean;
  district_selected?: boolean;
  match_type?: 'exact' | 'alias';
  reason?: 'cancel' | 'unsupported' | 'permission' | 'other' | 'empty' | 'unmatched';
  error_code?: number;
  catalog_version?: string;
}

// Strict projection before transport, including runtime checks against accidental
// raw POI/error objects. No third-party analytics call or persistent retry queue.
export function trackRegionEvent(name: RegionEvent, input: RegionEventProperties): void {
  try {
    const properties: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(input)) {
      const allowed =
        (key === 'business' && ['ride', 'user_route'].includes(String(value))) ||
        (key === 'type' && [0, 1, 2].includes(value as number)) ||
        (['has_city', 'changed', 'district_selected'].includes(key) && typeof value === 'boolean') ||
        (['city_code', 'previous_city_code'].includes(key) && typeof value === 'string' && /^65\d{4}$/.test(value)) ||
        (key === 'match_type' && ['exact', 'alias'].includes(String(value))) ||
        (key === 'reason' && ['cancel', 'unsupported', 'permission', 'other', 'empty', 'unmatched'].includes(String(value))) ||
        (key === 'error_code' && [51120, 51121, 51122, 51123, 51124].includes(value as number)) ||
        (key === 'catalog_version' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
      if (allowed && ['string', 'number', 'boolean'].includes(typeof value))
        properties[key] = value as string | number | boolean;
    }
    void request({
      method: 'POST',
      url: '/telemetry/events',
      timeout: 3000,
      skipAuthRefresh: true,
      data: {
        event_id: `region-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
        name,
        properties,
        occurred_at: new Date().toISOString(),
      },
    } as AxiosRequestConfig).catch(() => undefined);
  } catch {
    // Telemetry must not block choosePoi, manual confirmation or saving.
  }
}

export function trackRegionRejection(error: unknown, business: RegionBusiness, version?: string): void {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'number' && [51120, 51121, 51122, 51123, 51124].includes(code))
    trackRegionEvent('region_submit_rejected', { business, error_code: code, catalog_version: version });
}
