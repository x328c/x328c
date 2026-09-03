import { Button, CoverView, Input, Map, Text, View } from "@tarojs/components";
import Taro, { useLoad, useUnload } from "@tarojs/taro";
import { useRef, useState } from "react";
import { hasValidLocationPoint } from "@/utils/coordinates";
import "./index.scss";

export default function CoordinatePickerPage() {
  const [center, setCenter] = useState({ latitude: 43.8256, longitude: 87.6168 });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const saving = useRef(false);
  const channel = useRef<{ emit: (event: string, point?: unknown) => void }>();
  useLoad((params) => {
    const opener = Taro.getCurrentInstance().page?.getOpenerEventChannel?.();
    if (typeof opener?.emit === "function") channel.current = { emit: (event, point) => opener.emit(event, point) };
    if (params.lat && params.lng) {
      const point = { latitude: Number(params.lat), longitude: Number(params.lng) };
      if (hasValidLocationPoint(point)) setCenter(point);
    }
  });
  useUnload(() => channel.current?.emit("coordinateCancelled"));
  const locate = async () => {
    try {
      const point = await Taro.getLocation({ type: "gcj02" });
      if (hasValidLocationPoint(point)) setCenter({ latitude: point.latitude, longitude: point.longitude });
    } catch { void Taro.showToast({ title: "定位不可用，仍可拖动地图选点", icon: "none" }); }
  };
  const confirm = async () => {
    if (saving.current || mapFailed) return;
    saving.current = true;
    setBusy(true);
    try {
      const point = await Taro.createMapContext("coordinate-map").getCenterLocation();
      if (!hasValidLocationPoint(point) || !channel.current) throw new Error("invalid point");
      channel.current.emit("coordinateSelected", {
        latitude: point.latitude, longitude: point.longitude, name: name.trim(), address: "",
      });
      await Taro.navigateBack();
    } catch { void Taro.showToast({ title: "无法读取地图中心，请重试", icon: "none" }); }
    finally { saving.current = false; setBusy(false); }
  };
  return <View className="coordinate-picker">
    <View className="coordinate-picker__map">
      <Map id="coordinate-map" latitude={center.latitude} longitude={center.longitude} scale={14}
        onError={() => { setMapFailed(true); void Taro.showToast({ title: "地图加载失败，请退出后重试", icon: "none" }); }}
        enableScroll enableZoom style={{ width: "100%", height: "100%" }}>
        <CoverView className="coordinate-picker__crosshair">＋</CoverView>
      </Map>
    </View>
    <View className="coordinate-picker__panel">
      <Text className="coordinate-picker__title">拖动地图，将目标位置移到中心十字准星</Text>
      <Text className="coordinate-picker__hint">无需地点名称。此模式不搜索地址，保存后请确认实际所属地州市。</Text>
      <Input placeholder="地点名称（选填，默认地图选点）" maxlength={80} value={name} onInput={(event) => setName(event.detail.value)} />
      <View className="coordinate-picker__actions">
        <Button onClick={() => void locate()}>定位到我</Button>
        <Button loading={busy} disabled={busy || mapFailed} onClick={() => void confirm()}>使用地图中心点</Button>
      </View>
    </View>
  </View>;
}
