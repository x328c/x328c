import { ScrollView, Text, View } from "@tarojs/components";
import type { RegionCatalog } from "@/services/regions";
import type { RegionSelection } from "@/utils/poi-region";
import "./index.scss";

interface Props {
  visible: boolean;
  pointName?: string;
  catalog?: RegionCatalog;
  cityCode?: string;
  districtCode?: string;
  onCancel: () => void;
  onConfirm: (region: RegionSelection) => void;
  onCityChange: (cityCode: string) => void;
  onDistrictChange: (districtCode?: string) => void;
}

export function RegionConfirmSheet(props: Props) {
  if (!props.visible) return null;
  const city =
    props.catalog?.cities.find((item) => item.code === props.cityCode) ??
    props.catalog?.cities[0];
  return (
    <View className="region-confirm" catchMove>
      <View className="region-confirm__mask" onClick={props.onCancel} />
      <View className="region-confirm__panel">
        <Text className="region-confirm__title">确认地点所属地区</Text>
        {props.pointName && <Text className="region-confirm__point">已选地点：{props.pointName}</Text>}
        <Text className="region-confirm__hint">
          请确认地点实际所属城市，用于本地同行和路线展示；区县可暂不确定。
        </Text>
        {props.catalog ? (
          <View className="region-confirm__columns">
            <ScrollView scrollY className="region-confirm__list">
              {props.catalog.cities.map((item) => (
                <Text
                  key={item.code}
                  className={
                    item.code === city?.code
                      ? "region-confirm__item region-confirm__item--active"
                      : "region-confirm__item"
                  }
                  onClick={() => props.onCityChange(item.code)}
                >
                  {item.name}
                </Text>
              ))}
            </ScrollView>
            <ScrollView scrollY className="region-confirm__list">
              <Text
                className={
                  !props.districtCode
                    ? "region-confirm__item region-confirm__item--active"
                    : "region-confirm__item"
                }
                onClick={() => props.onDistrictChange(undefined)}
              >
                全市 / 暂不确定
              </Text>
              {city?.districts.map((item) => (
                <Text
                  key={item.code}
                  className={
                    item.code === props.districtCode
                      ? "region-confirm__item region-confirm__item--active"
                      : "region-confirm__item"
                  }
                  onClick={() => props.onDistrictChange(item.code)}
                >
                  {item.name}
                </Text>
              ))}
            </ScrollView>
          </View>
        ) : (
          <Text className="region-confirm__loading">地区目录加载中…</Text>
        )}
        <View className="region-confirm__actions">
          <Text onClick={props.onCancel}>取消</Text>
          <Text
            className="region-confirm__confirm"
            onClick={() => {
              if (!props.catalog || !city) return;
              const district = city.districts.find(
                (item) => item.code === props.districtCode,
              );
              props.onConfirm({
                province_code: props.catalog.province.code,
                province_name: props.catalog.province.name,
                city_code: city.code,
                city_name: city.name,
                district_code: district?.code,
                district_name: district?.name,
              });
            }}
          >
            确认地区
          </Text>
        </View>
      </View>
    </View>
  );
}
