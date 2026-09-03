import Taro from "@tarojs/taro";
import {
  regionService,
  type RegionCatalog,
  type RegionCity,
} from "@/services/regions";
import type { RideLocationInput } from "@/types/api";
import { hasValidLocationPoint, normalizeLocationPoint } from "@/utils/coordinates";
import { trackRegionEvent, type RegionBusiness } from "@/services/region-analytics";
import { openCoordinatePicker, type CoordinateSelection } from "@/utils/map-coordinate-picker";

export interface RegionSelection {
  province_code: string;
  province_name: string;
  city_code: string;
  city_name: string;
  district_code?: string;
  district_name?: string;
}

export interface PoiRegionPoint extends RideLocationInput {
  province_name?: string;
  city_name?: string;
  district_name?: string;
}

let catalogPromise: Promise<RegionCatalog> | undefined;

export const loadRegionCatalog = () => {
  catalogPromise ??= regionService.list()
    .then((catalog) => {
      if (!catalog?.cities?.length || catalog.province?.code !== "650000")
        throw new Error("Invalid region catalog");
      return catalog;
    })
    .catch((error) => {
      catalogPromise = undefined;
      throw error;
    });
  return catalogPromise;
};

// Opening the editor can be called directly by a click handler, outside the
// map picker try/catch. Never replace the saved point when the catalog fails.
export const prepareRegionConfirmation = async (
  point: PoiRegionPoint,
  preferredCityCode?: string,
  existingCatalog?: RegionCatalog,
) => {
  try {
    const catalog = existingCatalog ?? (await loadRegionCatalog());
    const city =
      catalog.cities.find((item) => item.code === point.city_code) ??
      catalog.cities.find((item) => item.code === preferredCityCode) ??
      catalog.cities[0];
    if (!city) throw new Error("Empty region catalog");
    const district = city.code === point.city_code
      ? city.districts.find((item) => item.code === point.district_code)
      : undefined;
    return { catalog, cityCode: city.code, districtCode: district?.code };
  } catch {
    await Taro.showToast({
      title: "地区目录加载失败，请重试",
      icon: "none",
    }).catch(() => undefined);
    return undefined;
  }
};

const normalizeRegionName = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^(?:新疆维吾尔自治区|新疆自治区|新疆)/, "");

const CITY_ALIASES: Record<string, string[]> = {
  "650100": ["乌鲁木齐", "乌市"],
  "650200": ["克拉玛依"],
  "650400": ["吐鲁番"],
  "650500": ["哈密"],
  "652300": ["昌吉", "昌吉州"],
  "652700": ["博尔塔拉", "博州"],
  "652800": ["巴音郭楞", "巴州"],
  "652900": ["阿克苏"],
  "653000": ["克孜勒苏", "克州"],
  "653100": ["喀什"],
  "653200": ["和田"],
  "654000": ["伊犁", "伊犁州"],
  "654200": ["塔城"],
  "654300": ["阿勒泰"],
  "659001": ["石河子"],
  "659002": ["阿拉尔"],
  "659003": ["图木舒克"],
  "659004": ["五家渠"],
  "659005": ["北屯"],
  "659006": ["铁门关"],
  "659007": ["双河"],
  "659008": ["可克达拉"],
  "659009": ["昆玉"],
  "659010": ["胡杨河"],
  "659011": ["新星"],
  "659012": ["白杨"],
};

export const matchPoiCity = (
  rawCity: unknown,
  catalog: RegionCatalog,
): RegionCity | undefined => {
  const normalized = normalizeRegionName(rawCity);
  if (!normalized) return undefined;
  // Prefer exact catalog names. Do not strip arbitrary administrative suffixes:
  // that would turn invented names such as 乌鲁木齐自治州 into a valid city.
  const exact = catalog.cities.find(
    (city) => normalizeRegionName(city.name) === normalized,
  );
  if (exact) return exact;
  const matches = catalog.cities.filter((city) => {
    const candidates = [
      city.name,
      ...(city.aliases ?? []),
      ...(CITY_ALIASES[city.code] ?? []),
    ];
    return candidates.some(
      (candidate) => normalizeRegionName(candidate) === normalized,
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
};

export const withRegion = (
  point: PoiRegionPoint,
  region: RegionSelection,
): PoiRegionPoint => ({
  ...point,
  province_code: region.province_code,
  province_name: region.province_name,
  city_code: region.city_code,
  city_name: region.city_name,
  district_code: region.district_code,
  district_name: region.district_name,
});

/** Address matching is a conservative text hint, not reverse geocoding.
 * Only match an administrative prefix, never a city name buried in a shop/road.
 * A uniquely named county-level city maps to its parent prefecture.
 */
export const matchAddressRegion = (address: unknown, catalog: RegionCatalog): RegionSelection | undefined => {
  if (typeof address !== "string") return undefined;
  let text = address.normalize("NFKC").trim().replace(/\s+/g, "");
  text = text.replace(/^中国/, "").replace(/^(新疆维吾尔自治区|新疆自治区|新疆)/, "");
  const prefix = (label: string) => text.startsWith(label) &&
    !/^(路|街|大道|大厦|酒店|宾馆|办事处)/.test(text.slice(label.length));
  const districts = catalog.cities.flatMap((city) => city.districts.map((district) => ({ city, district })));
  const cities = catalog.cities.filter((city) => prefix(city.name));
  let city: RegionCity | undefined;
  let district: RegionCity["districts"][number] | undefined;
  if (cities.length === 1) {
    city = cities[0];
    text = text.slice(city.name.length).replace(/^[,，、/]+/, "");
    const children = districts.filter((item) => prefix(item.district.name));
    // Explicit conflicting child region means manual confirmation, not guessing.
    if (children.length && !children.some((item) => item.city.code === city!.code)) return undefined;
    const own = children.filter((item) => item.city.code === city!.code);
    if (own.length === 1) district = own[0].district;
    if (catalog.cities.some((item) => item.code !== city!.code && prefix(item.name))) return undefined;
  } else if (!cities.length) {
    const matches = districts.filter((item) => prefix(item.district.name));
    if (matches.length !== 1) return undefined;
    ({ city, district } = matches[0]);
  }
  if (!city) return undefined;
  return {
    province_code: catalog.province.code, province_name: catalog.province.name,
    city_code: city.code, city_name: city.name,
    district_code: district?.code, district_name: district?.name,
  };
};

export const chooseMapRegionPoint = async (
  catalog: RegionCatalog,
  business?: RegionBusiness,
  initialPoint?: PoiRegionPoint,
): Promise<{
  point: PoiRegionPoint;
  matchedRegion?: RegionSelection;
}> => {
  if (!Taro.canIUse("chooseLocation")) {
    if (business) trackRegionEvent('poi_choose_failed', { business, reason: 'unsupported', catalog_version: catalog.version });
    throw new Error("当前微信版本不支持地图选点，请升级微信后重试");
  }
  let result: CoordinateSelection;
  try {
    // Native map picker supports dragging the map. choosePoi opens a POI list
    // instead and must not silently replace this interaction.
    result = await Taro.chooseLocation(
      initialPoint && hasValidLocationPoint(initialPoint)
        ? { latitude: initialPoint.latitude, longitude: initialPoint.longitude }
        : {},
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(
            (error as { errMsg?: string } | undefined)?.errMsg ??
              "地图选点失败",
          );
    if (business) trackRegionEvent('poi_choose_failed', {
      business,
      reason: /cancel/i.test(message) ? 'cancel' : /auth|permission|deny/i.test(message) ? 'permission' : 'other',
      catalog_version: catalog.version,
    });
    // Do not route around a privacy/permission rejection or a deliberate cancel.
    // Generic native failure at an unnamed location returns no coordinates.
    if (/cancel|auth|permission|deny|scope|privacy|requiredPrivateInfos/i.test(message)) throw new Error(message);
    const answer = await Taro.showModal({
      title: "改用地图自由选点？",
      content: "微信未能返回该地点。可重新拖动地图选取无名称位置，无需选择附近的商家或道路。",
      confirmText: "自由选点", cancelText: "取消",
    });
    if (!answer.confirm) throw new Error("chooseLocation:fail cancel");
    result = await openCoordinatePicker(initialPoint);
  }
  const raw = result as unknown as {
    name?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  const address = typeof raw.address === "string" ? raw.address.trim() : "";
  const name = (typeof raw.name === "string" ? raw.name.trim() : "") || address || "地图选点";
  if (raw.latitude == null || raw.longitude == null)
    throw new Error("未选择有效地点");
  const point = normalizeLocationPoint({
    name,
    address,
    latitude: raw.latitude,
    longitude: raw.longitude,
  }) as PoiRegionPoint;
  if (!hasValidLocationPoint(point)) throw new Error("地点坐标无效，请重新选择");
  const matchedRegion = matchAddressRegion(address, catalog);
  // Keep raw addresses and coordinates out of telemetry. has_city refers to
  // the native city field, not a city inferred from address text.
  if (business) trackRegionEvent('poi_choose_success', {
    business, type: 2, has_city: false, catalog_version: catalog.version,
  });
  return { point: matchedRegion ? withRegion(point, matchedRegion) : point, matchedRegion };
};

export const regionLabel = (point?: PoiRegionPoint, catalog?: RegionCatalog) => {
  if (!point?.city_code) return "待确认所属城市";
  const city = catalog?.cities.find((item) => item.code === point.city_code);
  const district = city?.districts.find((item) => item.code === point.district_code);
  return (
    [point.city_name || city?.name, point.district_name || district?.name].filter(Boolean).join(" · ") ||
    point.city_code
  );
};

export const toLocationInput = (point: PoiRegionPoint): RideLocationInput => ({
  name: point.name,
  address: point.address,
  latitude: point.latitude,
  longitude: point.longitude,
  province_code: point.province_code,
  city_code: point.city_code,
  district_code: point.district_code,
});
