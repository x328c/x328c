import { Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad } from "@tarojs/taro";
import { useCallback, useEffect, useState } from "react";
import { RegionConfirmSheet } from "@/components";
import { RIDE_STYLES } from "@/constants";
import { rideService } from "@/services/rides";
import { routeService } from "@/services/routes";
import { userRouteService } from "@/services/user-routes";
import { confirmSafetyAgreement } from "@/services/safety";
import type {
  CreateRidePayload,
  RideLocationInput,
  RideSummary,
} from "@/types/api";
import { useRegionStore } from "@/stores/region-store";
import { trackRegionEvent, trackRegionRejection } from "@/services/region-analytics";
import type { RegionCatalog } from "@/services/regions";
import "./index.scss";
import { ensureProfileComplete } from "@/utils/profile-completeness";
import {
  hasValidLocationPoint,
  normalizeCoordinate,
  normalizeLocationPoint,
} from "@/utils/coordinates";
import {
  chooseMapRegionPoint,
  loadRegionCatalog,
  prepareRegionConfirmation,
  regionLabel,
  withRegion,
  type PoiRegionPoint,
  type RegionSelection,
} from "@/utils/poi-region";

const TEMPLATE_ID = __RIDE_REMINDER_TEMPLATE_ID__;
const today = () => new Date().toISOString().slice(0, 10);
const futureTime = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toTimeString().slice(0, 5),
  };
};

interface RideForm {
  title: string;
  rideStyle: number;
  date: string;
  time: string;
  meetupAddress: string;
  meetupLat?: number;
  meetupLng?: number;
  meetupPoint?: PoiRegionPoint;
  destination: string;
  destinationPoint?: RideLocationInput;
  waypoints: RideLocationInput[];
  minPeople: string;
  maxPeople: string;
  speedLevel: number;
  bikeRequirement: string;
  description: string;
}

interface LinkedRoute {
  id: string;
  source_type: "official" | "user";
  title: string;
  start?: PoiRegionPoint;
  end?: PoiRegionPoint;
  waypoints: RideLocationInput[];
}

const normalizeRideLocationPoint = (
  point: RideLocationInput,
): RideLocationInput => {
  const normalized = normalizeLocationPoint(point);
  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    name: normalized.name.trim(),
    address: normalized.address?.trim() || undefined,
    province_code: normalized.province_code?.trim() || undefined,
    city_code: normalized.city_code?.trim() || undefined,
    district_code: normalized.district_code?.trim() || undefined,
  };
};

const hasUsableRideLocationPoint = (point: RideLocationInput): boolean =>
  Boolean(point.name.trim()) && hasValidLocationPoint(point);

export default function CreateRidePage() {
  const [form, setForm] = useState<RideForm>(() => ({
    title: "",
    rideStyle: 0,
    ...futureTime(),
    meetupAddress: "",
    destination: "",
    destinationPoint: undefined,
    waypoints: [],
    minPeople: "2",
    maxPeople: "6",
    speedLevel: 2,
    bikeRequirement: "",
    description: "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<RideSummary | undefined>(undefined);
  const [selectedRoute, setSelectedRoute] = useState<LinkedRoute>();
  const [routeCustomized, setRouteCustomized] = useState(false);
  const [catalog, setCatalog] = useState<RegionCatalog>();
  const [pending, setPending] = useState<{
    kind: "meetup" | "waypoint" | "destination";
    point: PoiRegionPoint;
    index?: number;
  }>();
  const [confirmCity, setConfirmCity] = useState("");
  const [confirmDistrict, setConfirmDistrict] = useState<string>();
  useEffect(() => {
    void loadRegionCatalog().then(setCatalog).catch(() => undefined);
  }, []);
  const selectedRegion = useRegionStore((state) => state.selected);

  const loadLinkedRoute = useCallback(
    async (source: "official" | "user", id: string) => {
      if (source === "user") {
        const route = await userRouteService.detail(id);
        return {
          id: route.id,
          source_type: source,
          title: route.title,
          start: normalizeRideLocationPoint({
            name: route.start_location,
            latitude: route.start_lat,
            longitude: route.start_lng,
            province_code: "650000",
            city_code: route.city_code ?? undefined,
            district_code: route.district_code ?? undefined,
          }) as PoiRegionPoint,
          end:
            route.end_location && route.end_lat != null && route.end_lng != null
              ? (normalizeRideLocationPoint({
                  name: route.end_location,
                  latitude: route.end_lat,
                  longitude: route.end_lng,
                  ...(route.end_point ?? {}),
                }) as PoiRegionPoint)
              : undefined,
          waypoints: route.waypoints
            .map(normalizeRideLocationPoint)
            .filter(hasUsableRideLocationPoint),
        } satisfies LinkedRoute;
      }
      const route = await routeService.detail(id);
      const start =
        route.points.find((point) => point.type === "start") ?? route.points[0];
      const end =
        route.points.find((point) => point.type === "end") ??
        route.points[route.points.length - 1];
      return {
        id: route.id,
        source_type: source,
        title: route.title,
        start: start
          ? (normalizeRideLocationPoint({
              name: start.name,
              latitude: Number(start.latitude),
              longitude: Number(start.longitude),
              province_code: start.province_code ?? undefined,
              city_code: start.city_code ?? undefined,
              district_code: start.district_code ?? undefined,
            }) as PoiRegionPoint)
          : undefined,
        end: end
          ? (normalizeRideLocationPoint({
              name: end.name,
              latitude: Number(end.latitude),
              longitude: Number(end.longitude),
              province_code: end.province_code ?? undefined,
              city_code: end.city_code ?? undefined,
              district_code: end.district_code ?? undefined,
            }) as PoiRegionPoint)
          : undefined,
        waypoints: route.points
          .filter((point) => point.type === "waypoint")
          .map((point) =>
            normalizeRideLocationPoint({
              name: point.name,
              address: point.address ?? undefined,
              latitude: Number(point.latitude),
              longitude: Number(point.longitude),
              province_code: point.province_code ?? undefined,
              city_code: point.city_code ?? undefined,
              district_code: point.district_code ?? undefined,
            }),
          )
          .filter(hasUsableRideLocationPoint),
      } satisfies LinkedRoute;
    },
    [],
  );

  const applyLinkedRoute = useCallback((route: LinkedRoute) => {
    setSelectedRoute(route);
    setRouteCustomized(false);
    setForm((current) => ({
      ...current,
      meetupAddress: route.start?.name ?? current.meetupAddress,
      meetupLat: route.start?.latitude ?? current.meetupLat,
      meetupLng: route.start?.longitude ?? current.meetupLng,
      meetupPoint: route.start ?? current.meetupPoint,
      destination: route.end?.name ?? current.destination,
      destinationPoint: route.end ? { ...route.end } : current.destinationPoint,
      waypoints: route.waypoints,
    }));
  }, []);

  useLoad((options) => {
    if (options.relaunchId) {
      void rideService
        .relaunchTemplate(options.relaunchId)
        .then((template) => {
          const nextTime = futureTime();
          const templateWaypoints = (template.waypoints ?? [])
            .map(normalizeRideLocationPoint)
            .filter(hasUsableRideLocationPoint);
          const templateDestination = template.destination_point
            ? normalizeRideLocationPoint(template.destination_point)
            : undefined;
          const meetupPoint = normalizeRideLocationPoint({
            name: template.meetup_address,
            latitude: normalizeCoordinate(template.meetup_lat),
            longitude: normalizeCoordinate(template.meetup_lng),
            province_code: "650000",
            city_code: template.city_code ?? undefined,
            district_code: template.district_code ?? undefined,
          }) as PoiRegionPoint;
          setForm({
            title: template.title,
            rideStyle: template.ride_style,
            ...nextTime,
            meetupAddress: template.meetup_address,
            meetupLat: meetupPoint.latitude,
            meetupLng: meetupPoint.longitude,
            meetupPoint,
            destination: template.destination ?? "",
            destinationPoint:
              templateDestination &&
              hasUsableRideLocationPoint(templateDestination)
                ? templateDestination
                : undefined,
            waypoints: templateWaypoints,
            minPeople: String(template.min_people),
            maxPeople: String(template.max_people),
            speedLevel: template.speed_level,
            bikeRequirement: template.bike_requirement ?? "",
            description: template.description ?? "",
          });
          const linkedId = template.user_route_id || template.route_id;
          if (linkedId)
            void loadLinkedRoute(
              template.user_route_id ? "user" : "official",
              linkedId,
            )
              .then((route) => { setSelectedRoute(route); setRouteCustomized(true); })
              .catch(() => undefined);
        })
        .catch((error) =>
          Taro.showToast({
            title: error instanceof Error ? error.message : "无法再次发起",
            icon: "none",
          }),
        );
      return;
    }
    if (!options.routeId) return;
    const source = options.routeSource === "user" ? "user" : "official";
    void loadLinkedRoute(source, options.routeId)
      .then(applyLinkedRoute)
      .catch(() =>
        Taro.showToast({
          title: "关联路线已失效，可继续不关联发布",
          icon: "none",
        }),
      );
  });
  useDidShow(() => {
    const stored = Taro.getStorageSync<{
      id?: string;
      source_type?: "official" | "user";
    }>("v22:create-route");
    if (
      stored?.id &&
      (stored.id !== selectedRoute?.id ||
        stored.source_type !== selectedRoute?.source_type)
    ) {
      void loadLinkedRoute(stored.source_type ?? "official", stored.id)
        .then(applyLinkedRoute)
        .catch(() => Taro.removeStorageSync("v22:create-route"));
    }
  });

  useEffect(() => {
    if (form.date < today())
      setForm((current) => ({ ...current, ...futureTime() }));
  }, [form.date]);

  const update = <K extends keyof RideForm>(key: K, value: RideForm[K]) => {
    if (key === "waypoints") setRouteCustomized(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const moveWaypoint = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.waypoints.length) return;
    const next = [...form.waypoints];
    [next[index], next[target]] = [next[target], next[index]];
    update("waypoints", next);
  };

  const applyPoint = useCallback(
    (
      kind: "meetup" | "waypoint" | "destination",
      point: PoiRegionPoint,
      index?: number,
    ) => {
      setRouteCustomized(true);
      setForm((current) => {
        if (kind === "meetup")
          return {
            ...current,
            meetupAddress: point.name,
            meetupLat: point.latitude,
            meetupLng: point.longitude,
            meetupPoint: point,
          };
        if (kind === "destination")
          return {
            ...current,
            destination: point.name,
            destinationPoint: point,
          };
        const waypoints = [...current.waypoints];
        if (index === undefined) waypoints.push(point);
        else waypoints[index] = point;
        return { ...current, waypoints };
      });
    },
    [],
  );
  const openRegionConfirm = useCallback(
    async (
      kind: "meetup" | "waypoint" | "destination",
      point: PoiRegionPoint,
      index?: number,
    ) => {
      const selection = await prepareRegionConfirmation(point, selectedRegion.city_code, catalog);
      if (!selection) return;
      setCatalog(selection.catalog);
      setConfirmCity(selection.cityCode);
      setConfirmDistrict(selection.districtCode);
      setPending({ kind, point, index });
    },
    [catalog, selectedRegion.city_code],
  );
  const chooseLocation = useCallback(
    async (kind: "meetup" | "waypoint" | "destination" = "meetup") => {
      try {
        const nextCatalog = catalog ?? (await loadRegionCatalog());
        setCatalog(nextCatalog);
        const initialPoint = kind === "meetup" ? form.meetupPoint
          : kind === "destination" ? form.destinationPoint : undefined;
        const result = await chooseMapRegionPoint(nextCatalog, "ride", initialPoint);
        if (result.matchedRegion) applyPoint(kind, result.point);
        else await openRegionConfirm(kind, result.point);
      } catch (error) {
        const message = error instanceof Error ? error.message : "选点失败";
        if (!message.includes("cancel"))
          Taro.showToast({ title: message, icon: "none" });
      }
    },
    [applyPoint, catalog, openRegionConfirm, form.meetupPoint, form.destinationPoint],
  );

  const validate = (): string | null => {
    if (!form.title.trim()) return "请填写同行标题";
    if (!form.rideStyle) return "请选择骑行风格";
    if (
      !form.meetupAddress ||
      form.meetupLat === undefined ||
      form.meetupLng === undefined
    )
      return "请选择集合地点";
    if (!form.meetupPoint?.city_code) return "请确认集合地点所属城市";
    const invalidWaypoint = form.waypoints.findIndex(
      (point) => !hasUsableRideLocationPoint(normalizeRideLocationPoint(point)),
    );
    if (invalidWaypoint >= 0)
      return `途经点 ${invalidWaypoint + 1} 的地图坐标无效，请重新选点`;
    const unresolvedWaypoint = form.waypoints.findIndex(
      (point) => !point.city_code,
    );
    if (unresolvedWaypoint >= 0)
      return `请确认途经点 ${unresolvedWaypoint + 1} 所属城市`;
    if (
      form.destinationPoint?.name.trim() &&
      !hasUsableRideLocationPoint(
        normalizeRideLocationPoint(form.destinationPoint),
      )
    )
      return "终点地图坐标无效，请重新选点";
    if (form.destinationPoint?.name.trim() && !form.destinationPoint.city_code)
      return "请确认终点所属城市";
    const departure = new Date(`${form.date}T${form.time}:00`);
    if (Number.isNaN(departure.getTime()) || departure <= new Date())
      return "出发时间必须晚于当前时间";
    const min = Number(form.minPeople);
    const max = Number(form.maxPeople);
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      max < min
    )
      return "请正确填写人数范围";
    return null;
  };

  const publish = useCallback(async () => {
    const error = validate();
    if (error) return Taro.showToast({ title: error, icon: "none" });
    if (!(await ensureProfileComplete("/pages/rides/create/index"))) return;
    setSubmitting(true);
    try {
      const confirmation = await confirmSafetyAgreement(
        "ride_create",
        `发起同行：${form.title.trim()}`,
      );
      if (confirmation === null) return;
      const payload: CreateRidePayload = {
        title: form.title.trim(),
        ride_style: form.rideStyle,
        departure_time: new Date(`${form.date}T${form.time}:00`).toISOString(),
        meetup_address: form.meetupAddress,
        meetup_lat: normalizeCoordinate(form.meetupLat!),
        meetup_lng: normalizeCoordinate(form.meetupLng!),
        destination: form.destination.trim() || undefined,
        destination_point: form.destinationPoint?.name.trim()
          ? normalizeRideLocationPoint(form.destinationPoint)
          : undefined,
        waypoints: form.waypoints.map(normalizeRideLocationPoint),
        min_people: Number(form.minPeople),
        max_people: Number(form.maxPeople),
        speed_level: form.speedLevel,
        bike_requirement: form.bikeRequirement.trim() || undefined,
        description: form.description.trim() || undefined,
        city_code: form.meetupPoint!.city_code!,
        district_code: form.meetupPoint!.district_code,
        ...(selectedRoute?.source_type === "user"
          ? { user_route_id: selectedRoute.id }
          : selectedRoute
            ? { route_id: selectedRoute.id }
            : {}),
        route_link_source: selectedRoute ? "route_detail" : undefined,
        route_customized: selectedRoute ? routeCustomized : undefined,
        agreement: confirmation?.agreement,
      };
      setCreated(
        await rideService.create(payload, confirmation?.idempotencyKey),
      );
      Taro.removeStorageSync("v22:create-route");
    } catch (requestError) {
      trackRegionRejection(requestError, "ride", catalog?.version);
      Taro.showToast({
        title:
          requestError instanceof Error
            ? requestError.message
            : "发布失败，请稍后重试",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, selectedRoute, routeCustomized, catalog?.version]);

  const finish = async () => {
    if (TEMPLATE_ID) {
      try {
        await Taro.requestSubscribeMessage({
          tmplIds: [TEMPLATE_ID],
          entityIds: [],
        });
      } catch {
        /* 用户可跳过授权 */
      }
    }
    if (created)
      Taro.redirectTo({ url: `/pages/rides/detail/index?id=${created.id}` });
  };

  return (
    <View className="create-ride">
      <View className="create-ride__group">
        <Text className="create-ride__group-title">基本信息</Text>
        <View className="create-ride__field">
          <Text>同行标题</Text>
          <Input
            value={form.title}
            maxlength={30}
            placeholder="如：南山周末轻松骑"
            onInput={(event) => update("title", event.detail.value)}
          />
          <Text className="create-ride__count">{form.title.length}/30</Text>
        </View>
        <View className="create-ride__field">
          <Text>关联路线（可选）</Text>
          <Text className="create-ride__value">
            {selectedRoute?.title ?? "未选择"}
          </Text>
          {selectedRoute ? (
            <Text
              onClick={() => {
                setSelectedRoute(undefined);
                Taro.removeStorageSync("v22:create-route");
              }}
            >
              移除
            </Text>
          ) : (
            <Text
              onClick={() =>
                Taro.navigateTo({ url: "/packageRoutes/pages/select/index" })
              }
            >
              选择路线
            </Text>
          )}
        </View>
        <Text className="create-ride__label">骑行风格</Text>
        <View className="create-ride__options">
          {Object.entries(RIDE_STYLES).map(([value, label]) => (
            <Text
              key={value}
              className={
                form.rideStyle === Number(value)
                  ? "create-ride__option create-ride__option--selected"
                  : "create-ride__option"
              }
              onClick={() => update("rideStyle", Number(value))}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
      <View className="create-ride__group">
        <Text className="create-ride__group-title">时间地点</Text>
        <View className="create-ride__field">
          <Text>出发日期</Text>
          <Picker
            mode="date"
            start={today()}
            value={form.date}
            onChange={(event) => update("date", event.detail.value)}
          >
            <Text className="create-ride__value">{form.date}</Text>
          </Picker>
        </View>
        <View className="create-ride__field">
          <Text>出发时间</Text>
          <Picker
            mode="time"
            value={form.time}
            onChange={(event) => update("time", event.detail.value)}
          >
            <Text className="create-ride__value">{form.time}</Text>
          </Picker>
        </View>
        <View
          className="create-ride__field"
          onClick={() => void chooseLocation("meetup")}
        >
          <Text>集合地点</Text>
          <View className="create-ride__point">
            <Text
              className={
                form.meetupAddress
                  ? "create-ride__value"
                  : "create-ride__placeholder"
              }
            >
              {form.meetupAddress || "地图选点"}
            </Text>
            {form.meetupPoint ? (
              <Text
                className="create-ride__region"
                onClick={(event) => {
                  event.stopPropagation();
                  void openRegionConfirm("meetup", form.meetupPoint!);
                }}
              >
                {regionLabel(form.meetupPoint, catalog)} · 修改
              </Text>
            ) : null}
          </View>
        </View>
        <Text className="create-ride__label">途经点（最多20个）</Text>
        {form.waypoints.map((point, index) => (
          <View
            key={`${point.latitude}-${point.longitude}-${index}`}
            className="create-ride__field"
          >
            <Text>途经 {index + 1}</Text>
            <View className="create-ride__point">
              <Text className="create-ride__value">{point.name}</Text>
              <Text
                className="create-ride__region"
                onClick={() =>
                  void openRegionConfirm(
                    "waypoint",
                    point as PoiRegionPoint,
                    index,
                  )
                }
              >
                {regionLabel(point as PoiRegionPoint, catalog)} · 修改
              </Text>
            </View>
            <Text onClick={() => moveWaypoint(index, -1)}>↑</Text>
            <Text onClick={() => moveWaypoint(index, 1)}>↓</Text>
            <Text
              onClick={() =>
                update(
                  "waypoints",
                  form.waypoints.filter(
                    (_, pointIndex) => pointIndex !== index,
                  ),
                )
              }
            >
              删除
            </Text>
          </View>
        ))}
        <View
          className="create-ride__field"
          onClick={() =>
            form.waypoints.length < 20 && void chooseLocation("waypoint")
          }
        >
          <Text>添加途经点</Text>
          <Text className="create-ride__placeholder">地图选点 ›</Text>
        </View>
        <View
          className="create-ride__field"
          onClick={() => void chooseLocation("destination")}
        >
          <Text>终点</Text>
          <View className="create-ride__point">
            <Text
              className={
                form.destinationPoint
                  ? "create-ride__value"
                  : "create-ride__placeholder"
              }
            >
              {form.destinationPoint?.name || "地图选点（选填）"}
            </Text>
            {form.destinationPoint ? (
              <Text
                className="create-ride__region"
                onClick={(event) => {
                  event.stopPropagation();
                  void openRegionConfirm(
                    "destination",
                    form.destinationPoint as PoiRegionPoint,
                  );
                }}
              >
                {regionLabel(form.destinationPoint as PoiRegionPoint, catalog)} · 修改
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <View className="create-ride__group">
        <Text className="create-ride__group-title">人数要求</Text>
        <View className="create-ride__field">
          <Text>最少人数</Text>
          <Input
            type="number"
            value={form.minPeople}
            onInput={(event) => update("minPeople", event.detail.value)}
          />
        </View>
        <View className="create-ride__field">
          <Text>最多人数</Text>
          <Input
            type="number"
            value={form.maxPeople}
            onInput={(event) => update("maxPeople", event.detail.value)}
          />
        </View>
        <Text className="create-ride__label">速度要求</Text>
        <View className="create-ride__options">
          {[
            [1, "休闲"],
            [2, "适中"],
            [3, "较快"],
          ].map(([value, label]) => (
            <Text
              key={value}
              className={
                form.speedLevel === value
                  ? "create-ride__option create-ride__option--selected"
                  : "create-ride__option"
              }
              onClick={() => update("speedLevel", value as number)}
            >
              {label}
            </Text>
          ))}
        </View>
        <View className="create-ride__field">
          <Text>车型要求</Text>
          <Input
            value={form.bikeRequirement}
            maxlength={100}
            placeholder="选填"
            onInput={(event) => update("bikeRequirement", event.detail.value)}
          />
        </View>
      </View>
      <View className="create-ride__group">
        <Text className="create-ride__group-title">补充说明</Text>
        <Textarea
          value={form.description}
          maxlength={200}
          placeholder="补充路线、装备、注意事项等"
          autoHeight
          onInput={(event) => update("description", event.detail.value)}
        />
        <Text className="create-ride__count create-ride__count--bottom">
          {form.description.length}/200
        </Text>
      </View>
      <View className="create-ride__agreement">
        <Text>
          提交前将展示当前版本“安全须知与风险提示”，需逐次阅读并主动确认。
        </Text>
      </View>
      <View className="create-ride__footer">
        <View
          className={
            submitting
              ? "create-ride__submit create-ride__submit--disabled"
              : "create-ride__submit"
          }
          onClick={() => void publish()}
        >
          {submitting ? "发布中…" : "发起同行"}
        </View>
      </View>
      {created && (
        <View className="create-ride__success">
          <View className="create-ride__success-panel">
            <Text className="create-ride__success-icon">✓</Text>
            <Text className="create-ride__success-title">发布成功</Text>
            <Text className="create-ride__success-text">
              开启订阅消息，及时接收报名与出发提醒
            </Text>
            <View
              className="create-ride__success-button"
              onClick={() => void finish()}
            >
              开启提醒并查看详情
            </View>
            <Text className="create-ride__skip" onClick={() => void finish()}>
              暂不开启
            </Text>
          </View>
        </View>
      )}
      <RegionConfirmSheet
        pointName={pending?.point.name}
        visible={Boolean(pending)}
        catalog={catalog}
        cityCode={confirmCity}
        districtCode={confirmDistrict}
        onCityChange={(code) => {
          setConfirmCity(code);
          setConfirmDistrict(undefined);
        }}
        onDistrictChange={setConfirmDistrict}
        onCancel={() => setPending(undefined)}
        onConfirm={(region: RegionSelection) => {
          if (pending) {
            trackRegionEvent('poi_region_manual_confirm', {
              business: 'ride', city_code: region.city_code,
              previous_city_code: pending.point.city_code,
              changed: Boolean(pending.point.city_code && pending.point.city_code !== region.city_code),
              district_selected: Boolean(region.district_code), catalog_version: catalog?.version,
            });
            applyPoint(
              pending.kind,
              withRegion(pending.point, region),
              pending.index,
            );
          }
          setPending(undefined);
        }}
      />
    </View>
  );
}
