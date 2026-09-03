import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface MapPointInput {
  latitude: number;
  longitude: number;
  province_code?: string | null;
  city_code?: string | null;
  district_code?: string | null;
}

interface TencentMapPayload {
  status?: number;
  message?: string;
  result?: {
    routes?: Array<{ polyline?: number[] }>;
  };
}

@Injectable()
export class MapProviderService {
  private readonly logger = new Logger(MapProviderService.name);
  async planDrivingRoute(points: Array<Pick<MapPointInput, 'latitude' | 'longitude'>>) {
    const key = process.env.TENCENT_MAP_ROUTE_KEY?.trim();
    if (!key || points.length < 2) return null;
    try {
      const url = new URL('https://apis.map.qq.com/ws/direction/v1/driving');
      const [start, ...rest] = points;
      const end = rest.at(-1)!;
      url.searchParams.set('from', `${start.latitude},${start.longitude}`);
      url.searchParams.set('to', `${end.latitude},${end.longitude}`);
      if (rest.length > 1) {
        url.searchParams.set(
          'waypoints',
          rest
            .slice(0, -1)
            .map((point) => `${point.latitude},${point.longitude}`)
            .join(';'),
        );
      }
      url.searchParams.set('key', key);
      this.signUrl(url);
      const payload = await this.fetchJson(url);
      const encoded = payload.result?.routes?.[0]?.polyline;
      if (!Array.isArray(encoded) || encoded.length < 4) return null;
      const decoded = encoded.map(Number);
      for (let index = 2; index < decoded.length; index += 1)
        decoded[index] = decoded[index - 2] + decoded[index] / 1_000_000;
      const polyline: Array<{ latitude: number; longitude: number }> = [];
      for (let index = 0; index + 1 < decoded.length; index += 2)
        polyline.push({ latitude: decoded[index], longitude: decoded[index + 1] });
      return polyline.length >= 2 ? polyline : null;
    } catch (error) {
      this.logger.warn(
        `driving route degraded: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async fetchJson(url: URL): Promise<TencentMapPayload> {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as TencentMapPayload;
    if (Number(payload.status) !== 0)
      throw new Error(`Tencent LBS ${payload.status}: ${payload.message ?? 'unknown'}`);
    return payload;
  }

  private signUrl(url: URL): void {
    const secret = process.env.TENCENT_MAP_ROUTE_SECRET?.trim();
    if (!secret) return;
    const parameters = [...url.searchParams.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    url.search = '';
    for (const [name, value] of parameters) url.searchParams.append(name, value);
    const rawQuery = parameters.map(([name, value]) => `${name}=${value}`).join('&');
    const signature = createHash('md5')
      .update(`${url.pathname}?${rawQuery}${secret}`, 'utf8')
      .digest('hex');
    url.searchParams.set('sig', signature);
  }
}
