import { request } from "./request";

export interface RegionDistrict { code: string; name: string }
export interface RegionCity { code: string; name: string; aliases?: string[]; districts: RegionDistrict[] }
export interface RegionCatalog {
  version: string;
  province: { code: string; name: string };
  cities: RegionCity[];
}

export const regionService = {
  list: () => request<RegionCatalog>({ url: "/regions", params: { province_code: "650000" } }),
};
