import { Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import {
  XINJIANG_BOUNDS,
  XINJIANG_CITIES,
  XINJIANG_PROVINCE,
  XINJIANG_REGION_DATA_VERSION,
} from './xinjiang-regions';

@Injectable()
export class RegionService {
  list(provinceCode: string = XINJIANG_PROVINCE.code) {
    if (provinceCode !== XINJIANG_PROVINCE.code) {
      throw new AppException(51120, '当前版本仅支持新疆维吾尔自治区');
    }

    return {
      version: XINJIANG_REGION_DATA_VERSION,
      province: XINJIANG_PROVINCE,
      cities: XINJIANG_CITIES,
    };
  }

  city(cityCode: string) {
    return XINJIANG_CITIES.find((item) => item.code === cityCode);
  }

  cityByDistrict(districtCode: string) {
    return XINJIANG_CITIES.find(
      (item) =>
        item.code === districtCode ||
        item.districts.some((district) => district.code === districtCode),
    );
  }

  isSupported(cityCode: string, districtCode?: string): boolean {
    const city = this.city(cityCode);
    if (!city) return false;
    if (!districtCode) return true;
    if (city.districts.length === 0) return districtCode === city.code;
    return city.districts.some((item) => item.code === districtCode);
  }

  assertSupported(cityCode: string | undefined, districtCode?: string, label = '地点') {
    if (!cityCode) throw new AppException(51122, `${label}缺少所属城市，请重新选点或人工确认`);
    const city = this.city(cityCode);
    if (!city) throw new AppException(51120, `${label}的城市不在当前新疆地区目录中`);
    if (districtCode && !this.isSupported(cityCode, districtCode))
      throw new AppException(51121, `${label}的区县不属于所选城市`);
  }

  assertPoint(
    point: { latitude: number; longitude: number; province_code?: string | null; city_code?: string | null; district_code?: string | null },
    label = '地点',
  ) {
    this.assertSupported(point.city_code ?? undefined, point.district_code ?? undefined, label);
    if (point.province_code && point.province_code !== XINJIANG_PROVINCE.code)
      throw new AppException(51120, `${label}不属于当前支持的新疆地区`);
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < XINJIANG_BOUNDS.minLat ||
      point.latitude > XINJIANG_BOUNDS.maxLat ||
      point.longitude < XINJIANG_BOUNDS.minLng ||
      point.longitude > XINJIANG_BOUNDS.maxLng
    ) {
      throw new AppException(51123, `${label}坐标不在当前支持的新疆范围内`);
    }
  }
}
