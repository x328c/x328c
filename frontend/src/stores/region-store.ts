import Taro from "@tarojs/taro";
import { create } from "zustand";

const STORAGE_KEY = "modazi:selected-region:v1";
export interface SelectedRegion {
  province_code: "650000";
  city_code: string;
  city_name: string;
  district_code?: string;
  district_name?: string;
}

const DEFAULT_REGION: SelectedRegion = {
  province_code: "650000",
  city_code: "650100",
  city_name: "乌鲁木齐市",
};

interface RegionState {
  selected: SelectedRegion;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  select: (region: SelectedRegion) => Promise<void>;
}

export const useRegionStore = create<RegionState>((set) => ({
  selected: DEFAULT_REGION,
  hydrated: false,
  hydrate: async () => {
    try {
      const saved = await Taro.getStorage<SelectedRegion>({ key: STORAGE_KEY });
      if (saved.data?.city_code) set({ selected: saved.data, hydrated: true });
      else set({ hydrated: true });
    } catch { set({ hydrated: true }); }
  },
  select: async (selected) => {
    set({ selected });
    await Taro.setStorage({ key: STORAGE_KEY, data: selected });
  },
}));
