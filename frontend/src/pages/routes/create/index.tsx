import { Image, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { RegionConfirmSheet } from "@/components";
import { userRouteService } from "@/services/user-routes";
import { trackRegionEvent, trackRegionRejection } from "@/services/region-analytics";
import type { RegionCatalog } from "@/services/regions";
import type { UserRoutePayload } from "@/types/api";
import { uploadImage } from "@/utils/upload";
import "../user-routes.scss";
import { ensureProfileComplete } from "@/utils/profile-completeness";
import { useRegionStore } from "@/stores/region-store";
import {
  chooseMapRegionPoint,
  loadRegionCatalog,
  prepareRegionConfirmation,
  regionLabel,
  toLocationInput,
  withRegion,
  type PoiRegionPoint,
  type RegionSelection,
} from "@/utils/poi-region";

type LocationKind = "start" | "end" | "waypoint";
export default function UserRouteCreatePage() {
  const selectedRegion = useRegionStore((state) => state.selected);
  const [id, setId] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    start: undefined as PoiRegionPoint | undefined,
    end: undefined as PoiRegionPoint | undefined,
    waypoints: [] as PoiRegionPoint[],
    externalRouteUrl: "",
    distance: "",
    time: "",
    difficulty: 3,
    images: [] as string[],
    visibility: 1 as 1 | 2,
  });
  const [catalog, setCatalog] = useState<RegionCatalog>();
  const [pending, setPending] = useState<{
    kind: LocationKind;
    point: PoiRegionPoint;
    index?: number;
  }>();
  const [confirmCity, setConfirmCity] = useState("");
  const [confirmDistrict, setConfirmDistrict] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void loadRegionCatalog().then(setCatalog).catch(() => undefined);
  }, []);
  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const moveWaypoint = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.waypoints.length) return;
    const next = [...form.waypoints];
    [next[index], next[target]] = [next[target], next[index]];
    update("waypoints", next);
  };
  useLoad((options) => {
    if (options.id) {
      setId(options.id);
      void userRouteService
        .detail(options.id)
        .then((route) =>
          setForm({
            title: route.title,
            description: route.description ?? "",
            start: {
              name: route.start_location,
              latitude: route.start_lat,
              longitude: route.start_lng,
              province_code: "650000",
              city_code: route.city_code ?? undefined,
              district_code: route.district_code ?? undefined,
            },
            end:
              route.end_location &&
              route.end_lat != null &&
              route.end_lng != null
                ? {
                    name: route.end_location,
                    latitude: route.end_lat,
                    longitude: route.end_lng,
                    ...(route.end_point ?? {}),
                  }
                : undefined,
            waypoints: route.waypoints,
            externalRouteUrl: route.external_route_url ?? "",
            distance: route.total_distance?.toString() ?? "",
            time: route.estimated_time?.toString() ?? "",
            difficulty: route.difficulty ?? 3,
            images: route.images,
            visibility: route.visibility,
          }),
        );
    }
  });
  const applyPoint = (
    kind: LocationKind,
    point: PoiRegionPoint,
    index?: number,
  ) => {
    if (kind === "waypoint") {
      const next = [...form.waypoints];
      if (index === undefined) next.push(point);
      else next[index] = point;
      update("waypoints", next);
    } else update(kind, point);
  };
  const openRegionConfirm = async (
    kind: LocationKind,
    point: PoiRegionPoint,
    index?: number,
  ) => {
    const selection = await prepareRegionConfirmation(point, selectedRegion.city_code, catalog);
    if (!selection) return;
    setCatalog(selection.catalog);
    setConfirmCity(selection.cityCode);
    setConfirmDistrict(selection.districtCode);
    setPending({ kind, point, index });
  };
  const chooseLocation = async (kind: LocationKind) => {
    try {
      const nextCatalog = catalog ?? (await loadRegionCatalog());
      setCatalog(nextCatalog);
      const result = await chooseMapRegionPoint(nextCatalog, "user_route",
        kind === "waypoint" ? undefined : form[kind]);
      if (result.matchedRegion) applyPoint(kind, result.point);
      else await openRegionConfirm(kind, result.point);
    } catch (error) {
      const message = error instanceof Error ? error.message : "地图选点失败";
      if (!message.includes("cancel"))
        Taro.showToast({ title: message, icon: "none" });
    }
  };
  const addImages = async () => {
    if (uploading) return;
    if (form.images.length >= 6)
      return void Taro.showToast({ title: "最多上传 6 张图片", icon: "none" });
    try {
      const result = await Taro.chooseImage({
        count: 6 - form.images.length,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      setUploading(true);
      const urls: string[] = [];
      for (const path of result.tempFilePaths)
        urls.push(await uploadImage(path, "image/jpeg", "user-routes"));
      update("images", [...form.images, ...urls].slice(0, 6));
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "上传失败",
        icon: "none",
      });
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    if (saving || uploading) return;
    if (!form.title.trim() || !form.start)
      return void Taro.showToast({
        title: "请填写标题并选择起点",
        icon: "none",
      });
    const unresolved = [
      form.start,
      ...form.waypoints,
      ...(form.end ? [form.end] : []),
    ].find((point) => !point.city_code);
    if (unresolved)
      return void Taro.showToast({
        title: `请确认“${unresolved.name}”所属城市`,
        icon: "none",
      });
    if (form.visibility === 2) {
      if (
        !(await ensureProfileComplete(
          id
            ? `/pages/routes/create/index?id=${id}`
            : "/pages/routes/create/index",
        ))
      )
        return;
      const confirmed = await Taro.showModal({
        title: "确认公开路线",
        content:
          "公开后，起点、终点和途经点的位置会向其他用户展示，路线也会出现在途经城市列表中。请确认未填写家庭住址等敏感地点。",
        confirmText: "确认发布",
      });
      if (!confirmed.confirm) return;
    }
    const payload: UserRoutePayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      start_location: form.start.name,
      start_lat: form.start.latitude,
      start_lng: form.start.longitude,
      end_location: form.end?.name,
      end_lat: form.end?.latitude,
      end_lng: form.end?.longitude,
      end_point: form.end ? toLocationInput(form.end) : undefined,
      waypoints: form.waypoints.map(toLocationInput),
      city_code: form.start.city_code,
      district_code: form.start.district_code ?? "",
      external_route_url: form.externalRouteUrl.trim(),
      total_distance: form.distance ? Number(form.distance) : undefined,
      estimated_time: form.time ? Number(form.time) : undefined,
      difficulty: form.difficulty,
      images: form.images,
      visibility: form.visibility,
    };
    setSaving(true);
    try {
      const route = id
        ? await userRouteService.update(id, payload)
        : await userRouteService.create(payload);
      Taro.showToast({ title: "保存成功", icon: "success" });
      setTimeout(
        () =>
          Taro.redirectTo({ url: `/pages/routes/detail/index?id=${route.id}` }),
        500,
      );
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "保存失败",
        icon: "none",
      });
      trackRegionRejection(error, "user_route", catalog?.version);
    } finally {
      setSaving(false);
    }
  };
  const regionAction = (
    kind: LocationKind,
    point: PoiRegionPoint,
    index?: number,
  ) => (
    <Text
      className="user-route-region"
      onClick={(event) => {
        event.stopPropagation();
        void openRegionConfirm(kind, point, index);
      }}
    >
      {regionLabel(point, catalog)} · 修改
    </Text>
  );
  return (
    <View className="user-route-page">
      <View className="user-route-form__group">
        <Text className="user-route-title">
          {id ? "编辑路线" : "录入骑行路线"}
        </Text>
        <Input
          className="user-route-form__input"
          value={form.title}
          maxlength={100}
          placeholder="路线标题（必填）"
          onInput={(e) => update("title", e.detail.value)}
        />
        <Textarea
          className="user-route-form__textarea"
          value={form.description}
          maxlength={5000}
          placeholder="路线描述"
          onInput={(e) => update("description", e.detail.value)}
        />
        <Text className="user-route-label">起终点</Text>
        <View
          className="user-route-location"
          onClick={() => void chooseLocation("start")}
        >
          <Text>起点：{form.start?.name ?? "地图选点"}</Text>
          {form.start ? regionAction("start", form.start) : null}
        </View>
        <View
          className="user-route-location"
          onClick={() => void chooseLocation("end")}
        >
          <Text>终点：{form.end?.name ?? "地图选点（选填）"}</Text>
          {form.end ? regionAction("end", form.end) : null}
        </View>
        <Text className="user-route-label">途经点</Text>
        {form.waypoints.map((point, index) => (
          <View key={`${point.name}-${index}`} className="user-route-location">
            <View>
              <Text>{point.name}</Text>
              {regionAction("waypoint", point, index)}
            </View>
            <Text onClick={() => moveWaypoint(index, -1)}>↑</Text>
            <Text onClick={() => moveWaypoint(index, 1)}>↓</Text>
            <Text
              onClick={() =>
                update(
                  "waypoints",
                  form.waypoints.filter((_, i) => i !== index),
                )
              }
            >
              删除
            </Text>
          </View>
        ))}
        <View
          className="user-route-location"
          onClick={() => void chooseLocation("waypoint")}
        >
          + 添加途经点
        </View>
        <Text className="user-route-label">第三方路线链接（选填）</Text>
        <Input
          className="user-route-form__input"
          value={form.externalRouteUrl}
          maxlength={1000}
          placeholder="高德、腾讯或百度地图 HTTPS 路线链接"
          onInput={(e) => update("externalRouteUrl", e.detail.value)}
        />
        <Text className="user-route-meta">
          受微信跳转规则限制时，将复制链接后在对应地图应用中打开。
        </Text>
        <Input
          className="user-route-form__input"
          type="number"
          value={form.distance}
          placeholder="总里程（公里）"
          onInput={(e) => update("distance", e.detail.value)}
        />
        <Input
          className="user-route-form__input"
          type="number"
          value={form.time}
          placeholder="预计时长（分钟）"
          onInput={(e) => update("time", e.detail.value)}
        />
        <Text className="user-route-label">难度：{form.difficulty} 星</Text>
        <View className="user-route-actions">
          {[1, 2, 3, 4, 5].map((value) => (
            <Text
              key={value}
              className={
                form.difficulty === value
                  ? "user-route-tab user-route-tab--active"
                  : "user-route-tab"
              }
              onClick={() => update("difficulty", value)}
            >
              ★{value}
            </Text>
          ))}
        </View>
        <Text className="user-route-label">路线图片（最多6张）</Text>
        <View className="user-route-images">
          {form.images.map((url, index) => (
            <View key={url} className="user-route-image-wrap">
              <Image className="user-route-image" src={url} mode="aspectFill" />
              <Text
                className="user-route-remove"
                onClick={() =>
                  update(
                    "images",
                    form.images.filter((_, i) => i !== index),
                  )
                }
              >
                ×
              </Text>
            </View>
          ))}
        </View>
        <View className="user-route-location" onClick={() => void addImages()}>
          {uploading ? "上传中…" : "+ 选择图片或拍照"}
        </View>
        <Text className="user-route-label">可见性</Text>
        <View className="user-route-actions">
          <Text
            className={
              form.visibility === 1
                ? "user-route-tab user-route-tab--active"
                : "user-route-tab"
            }
            onClick={() => update("visibility", 1)}
          >
            仅自己可见
          </Text>
          <Text
            className={
              form.visibility === 2
                ? "user-route-tab user-route-tab--active"
                : "user-route-tab"
            }
            onClick={() => update("visibility", 2)}
          >
            发布平台
          </Text>
        </View>
        {form.visibility === 2 ? (
          <Text className="user-route-meta">
            公开路线会展示所选点位，请勿填写家庭住址、单位等敏感地点。
          </Text>
        ) : null}
      </View>
      <View className="user-route-submit" onClick={() => void submit()}>
        {saving ? "保存中…" : "保存路线"}
      </View>
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
              business: 'user_route', city_code: region.city_code,
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
