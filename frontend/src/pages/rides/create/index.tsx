import { Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad } from "@tarojs/taro";
import { useCallback, useEffect, useState } from "react";
import { RIDE_STYLES } from "@/constants";
import { rideService } from "@/services/rides";
import { routeService } from "@/services/routes";
import { confirmSafetyAgreement } from "@/services/safety";
import type { CreateRidePayload, RideSummary, RouteDetail } from "@/types/api";
import "./index.scss";

const CITY_CODE = "650100";
const TEMPLATE_ID = __RIDE_REMINDER_TEMPLATE_ID__;
const today = () => new Date().toISOString().slice(0, 10);
const futureTime = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return { date: date.toISOString().slice(0, 10), time: date.toTimeString().slice(0, 5) };
};

interface RideForm {
  title: string;
  rideStyle: number;
  date: string;
  time: string;
  meetupAddress: string;
  meetupLat?: number;
  meetupLng?: number;
  destination: string;
  minPeople: string;
  maxPeople: string;
  speedLevel: number;
  bikeRequirement: string;
  description: string;
}

export default function CreateRidePage() {
  const [form, setForm] = useState<RideForm>(() => ({
    title: "", rideStyle: 0, ...futureTime(), meetupAddress: "", destination: "",
    minPeople: "2", maxPeople: "6", speedLevel: 2, bikeRequirement: "", description: "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<RideSummary | undefined>(undefined);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail>();

  useLoad((options) => {
    if (!options.routeId) return;
    void routeService.detail(options.routeId).then((route) => {
      setSelectedRoute(route);
      const start = route.points.find((point) => point.type === "start") ?? route.points[0];
      const end = route.points.find((point) => point.type === "end") ?? route.points[route.points.length - 1];
      setForm((current) => ({
        ...current,
        meetupAddress: start?.name ?? current.meetupAddress,
        meetupLat: start ? Number(start.latitude) : current.meetupLat,
        meetupLng: start ? Number(start.longitude) : current.meetupLng,
        destination: end?.name ?? current.destination,
      }));
    }).catch(() => Taro.showToast({ title: "关联路线已失效，可继续不关联发布", icon: "none" }));
  });
  useDidShow(() => {
    const stored = Taro.getStorageSync<{ id?: string }>("v21:create-route");
    if (stored?.id && stored.id !== selectedRoute?.id) {
      void routeService.detail(stored.id).then((route) => {
        setSelectedRoute(route);
        const start = route.points.find((point) => point.type === "start") ?? route.points[0];
        const end = route.points.find((point) => point.type === "end") ?? route.points[route.points.length - 1];
        setForm((current) => ({ ...current, meetupAddress: start?.name ?? current.meetupAddress, meetupLat: start ? Number(start.latitude) : current.meetupLat, meetupLng: start ? Number(start.longitude) : current.meetupLng, destination: end?.name ?? current.destination }));
      });
    }
  });

  useEffect(() => {
    if (form.date < today()) setForm((current) => ({ ...current, ...futureTime() }));
  }, [form.date]);

  const update = <K extends keyof RideForm>(key: K, value: RideForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const chooseLocation = useCallback(async () => {
    try {
      const location = await Taro.chooseLocation({});
      setForm((current) => ({
        ...current,
        meetupAddress: location.name || location.address,
        meetupLat: location.latitude,
        meetupLng: location.longitude,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "选点失败";
      if (!message.includes("cancel")) Taro.showToast({ title: "地图选点失败", icon: "none" });
    }
  }, []);

  const validate = (): string | null => {
    if (!form.title.trim()) return "请填写同行标题";
    if (!form.rideStyle) return "请选择骑行风格";
    if (!form.meetupAddress || form.meetupLat === undefined || form.meetupLng === undefined) return "请选择集合地点";
    const departure = new Date(`${form.date}T${form.time}:00`);
    if (Number.isNaN(departure.getTime()) || departure <= new Date()) return "出发时间必须晚于当前时间";
    const min = Number(form.minPeople); const max = Number(form.maxPeople);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) return "请正确填写人数范围";
    return null;
  };

  const publish = useCallback(async () => {
    const error = validate();
    if (error) return Taro.showToast({ title: error, icon: "none" });
    setSubmitting(true);
    try {
      const confirmation = await confirmSafetyAgreement("ride_create", `发起同行：${form.title.trim()}`);
      if (confirmation === null) return;
      const payload: CreateRidePayload = {
        title: form.title.trim(), ride_style: form.rideStyle,
        departure_time: new Date(`${form.date}T${form.time}:00`).toISOString(),
        meetup_address: form.meetupAddress, meetup_lat: form.meetupLat!, meetup_lng: form.meetupLng!,
        destination: form.destination.trim() || undefined,
        min_people: Number(form.minPeople), max_people: Number(form.maxPeople), speed_level: form.speedLevel,
        bike_requirement: form.bikeRequirement.trim() || undefined,
        description: form.description.trim() || undefined, city_code: CITY_CODE,
        route_id: selectedRoute?.id,
        route_link_source: selectedRoute ? "route_detail" : undefined,
        agreement: confirmation?.agreement,
      };
      setCreated(await rideService.create(payload, confirmation?.idempotencyKey));
      Taro.removeStorageSync("v21:create-route");
    } catch (requestError) {
      Taro.showToast({ title: requestError instanceof Error ? requestError.message : "发布失败，请稍后重试", icon: "none" });
    } finally { setSubmitting(false); }
  }, [form, selectedRoute]);

  const finish = async () => {
    if (TEMPLATE_ID) {
      try { await Taro.requestSubscribeMessage({ tmplIds: [TEMPLATE_ID], entityIds: [] }); } catch { /* 用户可跳过授权 */ }
    }
    if (created) Taro.redirectTo({ url: `/pages/rides/detail/index?id=${created.id}` });
  };

  return <View className="create-ride">
    <View className="create-ride__group"><Text className="create-ride__group-title">基本信息</Text>
      <View className="create-ride__field"><Text>同行标题</Text><Input value={form.title} maxlength={30} placeholder="如：南山周末轻松骑" onInput={(event) => update("title", event.detail.value)} /><Text className="create-ride__count">{form.title.length}/30</Text></View>
      <View className="create-ride__field"><Text>关联路线（可选）</Text><Text className="create-ride__value">{selectedRoute?.title ?? "未选择"}</Text>{selectedRoute ? <Text onClick={() => { setSelectedRoute(undefined); Taro.removeStorageSync("v21:create-route"); }}>移除</Text> : <Text onClick={() => Taro.navigateTo({ url: "/packageRoutes/pages/select/index" })}>选择官方路线</Text>}</View>
      <Text className="create-ride__label">骑行风格</Text><View className="create-ride__options">{Object.entries(RIDE_STYLES).map(([value, label]) => <Text key={value} className={form.rideStyle === Number(value) ? "create-ride__option create-ride__option--selected" : "create-ride__option"} onClick={() => update("rideStyle", Number(value))}>{label}</Text>)}</View>
    </View>
    <View className="create-ride__group"><Text className="create-ride__group-title">时间地点</Text>
      <View className="create-ride__field"><Text>出发日期</Text><Picker mode="date" start={today()} value={form.date} onChange={(event) => update("date", event.detail.value)}><Text className="create-ride__value">{form.date}</Text></Picker></View>
      <View className="create-ride__field"><Text>出发时间</Text><Picker mode="time" value={form.time} onChange={(event) => update("time", event.detail.value)}><Text className="create-ride__value">{form.time}</Text></Picker></View>
      <View className="create-ride__field" onClick={() => void chooseLocation()}><Text>集合地点</Text><Text className={form.meetupAddress ? "create-ride__value" : "create-ride__placeholder"}>{form.meetupAddress || "地图选点"}</Text></View>
      <View className="create-ride__field"><Text>目的地/路线</Text><Input value={form.destination} maxlength={200} placeholder="选填" onInput={(event) => update("destination", event.detail.value)} /></View>
    </View>
    <View className="create-ride__group"><Text className="create-ride__group-title">人数要求</Text>
      <View className="create-ride__field"><Text>最少人数</Text><Input type="number" value={form.minPeople} onInput={(event) => update("minPeople", event.detail.value)} /></View>
      <View className="create-ride__field"><Text>最多人数</Text><Input type="number" value={form.maxPeople} onInput={(event) => update("maxPeople", event.detail.value)} /></View>
      <Text className="create-ride__label">速度要求</Text><View className="create-ride__options">{[[1, "休闲"], [2, "适中"], [3, "较快"]].map(([value, label]) => <Text key={value} className={form.speedLevel === value ? "create-ride__option create-ride__option--selected" : "create-ride__option"} onClick={() => update("speedLevel", value as number)}>{label}</Text>)}</View>
      <View className="create-ride__field"><Text>车型要求</Text><Input value={form.bikeRequirement} maxlength={100} placeholder="选填" onInput={(event) => update("bikeRequirement", event.detail.value)} /></View>
    </View>
    <View className="create-ride__group"><Text className="create-ride__group-title">补充说明</Text><Textarea value={form.description} maxlength={200} placeholder="补充路线、装备、注意事项等" autoHeight onInput={(event) => update("description", event.detail.value)} /><Text className="create-ride__count create-ride__count--bottom">{form.description.length}/200</Text></View>
    <View className="create-ride__agreement"><Text>提交前将展示当前版本“安全须知与风险提示”，需逐次阅读并主动确认。</Text></View>
    <View className="create-ride__footer"><View className={submitting ? "create-ride__submit create-ride__submit--disabled" : "create-ride__submit"} onClick={() => void publish()}>{submitting ? "发布中…" : "发起同行"}</View></View>
    {created && <View className="create-ride__success"><View className="create-ride__success-panel"><Text className="create-ride__success-icon">✓</Text><Text className="create-ride__success-title">发布成功</Text><Text className="create-ride__success-text">开启订阅消息，及时接收报名与出发提醒</Text><View className="create-ride__success-button" onClick={() => void finish()}>开启提醒并查看详情</View><Text className="create-ride__skip" onClick={() => void finish()}>暂不开启</Text></View></View>}
  </View>;
}
