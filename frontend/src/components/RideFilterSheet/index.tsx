import { Text, View } from "@tarojs/components";
import { useState } from "react";
import { RIDE_STYLES } from "@/constants";
import "./index.scss";
export interface RideFilters { radius?: number; time: "all" | "today" | "tomorrow" | "week"; ride_style?: number; }
export const DEFAULT_RIDE_FILTERS: RideFilters = { radius: undefined, time: "all", ride_style: undefined };
export function RideFilterSheet({ visible, value, onClose, onConfirm }: { visible: boolean; value: RideFilters; onClose: () => void; onConfirm: (value: RideFilters) => void }) {
  const [draft, setDraft] = useState(value);
  if (!visible) return null;
  const select = <K extends keyof RideFilters>(key: K, option: RideFilters[K]) => setDraft((current) => ({ ...current, [key]: option }));
  const item = (selected: boolean, label: string, action: () => void) => <Text className={selected ? "ride-filter__item ride-filter__item--selected" : "ride-filter__item"} onClick={action}>{label}</Text>;
  return <View className="ride-filter"><View className="ride-filter__mask" onClick={onClose} /><View className="ride-filter__panel"><Text className="ride-filter__title">筛选同行</Text><Text className="ride-filter__label">距离范围</Text><View className="ride-filter__options">{[[3,"3km"],[5,"5km"],[10,"10km"],[30,"30km"],[undefined,"全城"]].map(([v,l]) => item(draft.radius === v, String(l), () => select("radius", v as number | undefined)))}</View><Text className="ride-filter__label">出发时间</Text><View className="ride-filter__options">{[["today","今天"],["tomorrow","明天"],["week","本周"],["all","全部"]].map(([v,l]) => item(draft.time === v, l, () => select("time", v as RideFilters["time"])))}</View><Text className="ride-filter__label">骑行风格</Text><View className="ride-filter__options">{item(!draft.ride_style,"全部",() => select("ride_style",undefined))}{Object.entries(RIDE_STYLES).map(([v,l]) => item(draft.ride_style === Number(v),l,() => select("ride_style",Number(v))))}</View><View className="ride-filter__footer"><Text onClick={() => setDraft(DEFAULT_RIDE_FILTERS)}>重置</Text><Text className="ride-filter__confirm" onClick={() => onConfirm(draft)}>确认</Text></View></View></View>;
}
