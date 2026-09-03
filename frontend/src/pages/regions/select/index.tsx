import { ScrollView, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { regionService, type RegionCatalog, type RegionCity } from "@/services/regions";
import { useRegionStore } from "@/stores/region-store";
import "./index.scss";

export default function RegionSelectPage() {
  const { selected, select } = useRegionStore();
  const [catalog, setCatalog] = useState<RegionCatalog>();
  const [city, setCity] = useState<RegionCity>();
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try {
      const data = await regionService.list();
      setCatalog(data);
      setCity(data.cities.find((item) => item.code === selected.city_code) ?? data.cities[0]);
    } catch { setError(true); }
  };
  useLoad(() => { void load(); });

  const choose = async (nextCity: RegionCity, district?: { code: string; name: string }) => {
    await select({
      province_code: "650000",
      city_code: nextCity.code,
      city_name: nextCity.name,
      district_code: district?.code,
      district_name: district?.name,
    });
    Taro.showToast({ title: `已切换至${district?.name ?? nextCity.name}`, icon: "success" });
    setTimeout(() => Taro.navigateBack(), 350);
  };

  if (error) return <StatePanel type="error" title="地区数据加载失败" actionText="重试" onAction={() => void load()} />;
  if (!catalog || !city) return <StatePanel type="loading" title="正在加载地区" />;

  return <View className="region-select">
    <View className="region-select__current"><Text>当前选择</Text><Text>{selected.city_name}{selected.district_name ? ` · ${selected.district_name}` : " · 全市"}</Text></View>
    <View className="region-select__columns">
      <ScrollView scrollY className="region-select__cities">
        {catalog.cities.map((item) => <View key={item.code} className={city.code === item.code ? "region-select__city region-select__city--active" : "region-select__city"} onClick={() => setCity(item)}>{item.name}</View>)}
      </ScrollView>
      <ScrollView scrollY className="region-select__districts">
        <View className={!selected.district_code && selected.city_code === city.code ? "region-select__district region-select__district--active" : "region-select__district"} onClick={() => void choose(city)}>全市/全地区</View>
        {city.districts.map((item) => <View key={item.code} className={selected.district_code === item.code ? "region-select__district region-select__district--active" : "region-select__district"} onClick={() => void choose(city, item)}>{item.name}</View>)}
      </ScrollView>
    </View>
    <Text className="region-select__hint">同行和路线将显示集合地/起点位于所选地区，或途经所选地区的内容；起点匹配优先展示。</Text>
  </View>;
}
