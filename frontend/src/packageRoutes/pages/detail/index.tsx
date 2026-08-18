import { Image, Map, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { trackRouteEvent } from "@/services/analytics";
import { ApiError } from "@/services/request";
import { routeService } from "@/services/routes";
import { useUserStore } from "@/stores/user-store";
import type { RideSummary, RouteComment, RouteDetail, RouteLinkSummary } from "@/types/api";
import { openLogin } from "@/utils/login-return";
import { uploadImage } from "@/utils/upload";
import "./index.scss";

const difficultyNames = { easy: "轻松", moderate: "适中", hard: "挑战" } as const;
const pointTypeNames = { start: "起点", waypoint: "途经", end: "终点" } as const;
export default function RouteDetailPage() {
  const [route, setRoute] = useState<RouteDetail>();
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "disabled" | "offline">("loading");
  const [routeId, setRouteId] = useState("");
  const [mapFailed, setMapFailed] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [comments, setComments] = useState<RouteComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [commentImageUploading, setCommentImageUploading] = useState(false);
  const [commentsState, setCommentsState] = useState<"loading" | "ready" | "disabled" | "error">("loading");
  const isLoggedIn = useUserStore((userState) => userState.isLoggedIn);

  const load = async (id: string) => {
    setState("loading");
    try {
      const detail = await routeService.detail(id);
      setRoute(detail); setState("ready");
      trackRouteEvent("route_detail_view", { route_id: id });
      const related = await routeService.relatedRides(id).catch(() => ({ items: [] }));
      setRides(related.items);
      try {
        const commentResult = await routeService.comments(id);
        setComments(commentResult.items);
        setCommentsState("ready");
      } catch (error) {
        setComments([]);
        setCommentsState(error instanceof ApiError && error.code === 52001 ? "disabled" : "error");
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 52001) setState("disabled");
      else if (error instanceof ApiError && (error.code === 53004 || error.status === 410)) setState("offline");
      else setState("error");
    }
  };

  useLoad((options) => {
    useUserStore.getState().hydrate();
    if (options.id) { setRouteId(options.id); void load(options.id); } else setState("error");
  });

  useDidShow(() => useUserStore.getState().hydrate());

  useShareAppMessage(() => ({
    title: route?.title ?? "摩搭子精选路线",
    path: `/packageRoutes/pages/detail/index?id=${route?.id ?? routeId}`,
    imageUrl: route?.cover_image ?? "",
  }));

  const toggleFavorite = async () => {
    if (!route || favoriteSaving) return;
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) {
      await openLogin(`/packageRoutes/pages/detail/index?id=${route?.id ?? routeId}`);
      return;
    }
    setFavoriteSaving(true);
    try {
      const result = route.is_favorited ? await routeService.unfavorite(route.id) : await routeService.favorite(route.id);
      setRoute({ ...route, is_favorited: result.favorited, favorite_count: result.favorite_count });
      trackRouteEvent("route_favorite", { route_id: route.id, favorited: result.favorited });
      Taro.showToast({ title: result.favorited ? "已收藏" : "已取消收藏", icon: "success" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" });
    } finally { setFavoriteSaving(false); }
  };

  const createFromRoute = () => {
    if (!route) return;
    const link: RouteLinkSummary = { id: route.id, source_type: "official", title: route.title, city_code: route.city_code, city_name: route.city_name, difficulty: route.difficulty, distance_km: route.distance_km, start_name: route.points.find((point) => point.type === "start")?.name, end_name: route.points.find((point) => point.type === "end")?.name, available: true };
    Taro.setStorageSync("v22:create-route", link);
    trackRouteEvent("route_create_companion_click", { route_id: route.id });
    void Taro.navigateTo({ url: `/pages/rides/create/index?routeId=${route.id}` });
  };

  const submitComment = async () => {
    if (!route || commentSaving || commentImageUploading) return;
    if (commentText.trim().length < 2) {
      Taro.showToast({ title: "请输入至少 2 个字", icon: "none" });
      return;
    }
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) return void openLogin(`/packageRoutes/pages/detail/index?id=${route.id}`);
    setCommentSaving(true);
    try {
      const created = await routeService.createComment(route.id, commentText.trim(), commentImages, `route-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setComments((items) => [created, ...items]); setCommentText(""); setCommentImages([]);
      Taro.showToast({ title: "评论已发布", icon: "success" });
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "评论提交失败", icon: "none" }); }
    finally { setCommentSaving(false); }
  };

  const chooseCommentImages = async () => {
    if (!route || commentImageUploading) return;
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) {
      await openLogin(`/packageRoutes/pages/detail/index?id=${route.id}`);
      return;
    }
    const remaining = 2 - commentImages.length;
    if (remaining <= 0) {
      Taro.showToast({ title: "最多上传 2 张图片", icon: "none" });
      return;
    }
    const uploaded: string[] = [];
    try {
      const selected = await Taro.chooseImage({
        count: remaining,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      if (selected.tempFilePaths.length > remaining) {
        Taro.showToast({ title: "最多上传 2 张图片", icon: "none" });
      }
      const paths = selected.tempFilePaths.slice(0, remaining);
      if (!paths.length) return;
      setCommentImageUploading(true);
      for (const path of paths) uploaded.push(await uploadImage(path, "image/jpeg", "route-comments"));
      setCommentImages((images) => [...images, ...uploaded].slice(0, 2));
    } catch (error) {
      if (uploaded.length) setCommentImages((images) => [...images, ...uploaded].slice(0, 2));
      Taro.showToast({ title: error instanceof Error ? error.message : "图片上传失败", icon: "none" });
    } finally {
      setCommentImageUploading(false);
    }
  };

  const previewImages = (images: string[], current: string) => {
    void Taro.previewImage({ current, urls: images });
  };

  const deleteComment = async (comment: RouteComment) => {
    try {
      await routeService.deleteComment(comment.id);
      setComments((items) => items.filter((item) => item.id !== comment.id));
      Taro.showToast({ title: "已删除", icon: "success" });
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" }); }
  };

  const reportComment = async (comment: RouteComment) => {
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) {
      await openLogin(`/packageRoutes/pages/detail/index?id=${route?.id ?? routeId}`);
      return;
    }
    const confirmed = await Taro.showModal({
      title: "举报评论",
      content: "确认举报该评论？",
      confirmText: "确认举报",
      confirmColor: "#c74700",
    });
    if (!confirmed.confirm) return;
    try {
      await routeService.reportComment(comment.id);
      Taro.showToast({ title: "举报已提交", icon: "success" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "举报失败", icon: "none" });
    }
  };

  if (state === "loading") return <View className="route-detail"><StatePanel type="loading" title="正在加载路线" /></View>;
  if (state === "disabled") return <View className="route-detail"><StatePanel type="disabled" title="路线功能暂未开放" description="同行功能仍可正常使用" actionText="返回同行" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /></View>;
  if (state === "offline") return <View className="route-detail"><StatePanel type="offline" title="该路线已下架" description="路线信息可能已发生变化，请浏览其他精选路线" actionText="返回路线列表" onAction={() => Taro.switchTab({ url: "/pages/routes/index" })} /></View>;
  if (state === "error" || !route) return <View className="route-detail"><StatePanel type="error" title="路线加载失败" actionText="重新加载" onAction={() => void load(routeId)} /></View>;

  const center = route.polyline[0] ?? (route.points[0] ? { latitude: Number(route.points[0].latitude), longitude: Number(route.points[0].longitude) } : undefined);
  const canShowMap = Boolean(center && route.polyline.length >= 2 && !mapFailed);

  return <View className="route-detail">
    {route.cover_image ? <Image className="route-detail__cover" mode="aspectFill" src={route.cover_image} /> : null}
    <View className="route-detail__header">
      <Text className="route-detail__title">{route.title}</Text>
      <Text className="route-detail__meta">{route.city_name || route.city_code} · {route.difficulty ? difficultyNames[route.difficulty] : "难度待补充"}</Text>
      <View className="route-detail__facts"><Text>{route.distance_km} km</Text><Text>约 {route.duration_min} 分钟</Text><Text>{route.favorite_count} 人收藏</Text></View>
    </View>
    <View className="route-detail__section">
      <Text className="route-detail__heading">地图与点位</Text>
      {canShowMap && center ? <Map className="route-detail__map" latitude={center.latitude} longitude={center.longitude} scale={10} polyline={[{ points: route.polyline, color: "#FF6A00", width: 5 }]} markers={route.points.map((point) => ({ id: Number(point.order + 1), latitude: Number(point.latitude), longitude: Number(point.longitude), title: point.name, iconPath: "/assets/tabbar/route-selected.png", width: 24, height: 24 }))} onError={() => setMapFailed(true)} /> : <View className="route-detail__map-fallback">地图暂不可用，以下文字点位仍可正常查看</View>}
      <View className="route-detail__points">{route.points.map((point) => <View key={point.id} className="route-detail__point"><Text className="route-detail__point-order">{point.order + 1}</Text><View><Text className="route-detail__point-name">{point.name}</Text><Text className="route-detail__point-meta">{pointTypeNames[point.type]}{point.description ? ` · ${point.description}` : ""}</Text></View></View>)}</View>
    </View>
    <View className="route-detail__section"><Text className="route-detail__heading">路线说明</Text><Text className="route-detail__copy">{route.summary || "暂无路线简介"}</Text><Text className="route-detail__label">路况</Text><Text className="route-detail__copy">{route.road_condition || "暂无"}</Text><Text className="route-detail__label">适合车型 / 季节</Text><Text className="route-detail__copy">{route.suitable_motorcycles || "不限"} · {route.best_season || "请根据实时天气判断"}</Text></View>
    <View className="route-detail__safety"><Text className="route-detail__heading">安全提示</Text><Text>{route.safety_notice}</Text></View>
    <View className="route-detail__section">
      <Text className="route-detail__heading">骑友评论</Text>
      {commentsState === "loading" ? <Text className="route-detail__copy">正在加载评论…</Text> : null}
      {commentsState === "disabled" ? <View className="route-detail__comment-notice">评论功能暂未开放</View> : null}
      {commentsState === "error" ? <View className="route-detail__comment-notice" onClick={() => void load(route.id)}>评论加载失败，点击重试</View> : null}
      {commentsState === "ready" ? <>
        <Textarea className="route-detail__comment-input" value={commentText} maxlength={500} placeholder={isLoggedIn ? "分享这条路线的体验（2-500 字）" : "登录后即可发表评论"} onInput={(event) => setCommentText(event.detail.value)} />
        <View className="route-detail__comment-images">
          {commentImages.map((url, index) => <View key={url} className="route-detail__comment-image-wrap"><Image className="route-detail__comment-image" src={url} mode="aspectFill" onClick={() => previewImages(commentImages, url)} /><Text className="route-detail__comment-image-remove" onClick={() => setCommentImages((images) => images.filter((_, imageIndex) => imageIndex !== index))}>×</Text></View>)}
          {commentImages.length < 2 ? <View className="route-detail__comment-image-add" onClick={() => void chooseCommentImages()}><Text>{commentImageUploading ? "上传中…" : "+ 图片"}</Text><Text>最多2张</Text></View> : null}
        </View>
        <View className="route-detail__comment-actions">
          <Text className="route-detail__comment-count">{commentText.length}/500</Text>
          <View className={`route-detail__comment-submit${commentSaving || commentImageUploading ? " route-detail__comment-submit--disabled" : ""}`} onClick={() => void submitComment()}>{commentSaving ? "发布中…" : commentImageUploading ? "图片上传中…" : isLoggedIn ? "发表评论" : "登录后发表评论"}</View>
        </View>
        {comments.length ? comments.map((comment) => { const mine = useUserStore.getState().user?.id === comment.author.id; return <View key={comment.id} className="route-detail__ride route-detail__comment"><View className="route-detail__comment-body"><Text className="route-detail__ride-title">{comment.author.nickname}</Text><Text className="route-detail__ride-meta">{comment.content}</Text>{comment.images?.length ? <View className="route-detail__comment-gallery">{comment.images.map((url) => <Image key={url} className="route-detail__comment-gallery-image" src={url} mode="aspectFill" onClick={() => previewImages(comment.images, url)} />)}</View> : null}<View className="route-detail__comment-footer"><Text onClick={() => mine ? void deleteComment(comment) : void reportComment(comment)}>{mine ? "删除" : "举报"}</Text></View></View></View>; }) : <Text className="route-detail__copy">还没有公开评论，来发表第一条吧</Text>}
      </> : null}
    </View>
    <View className="route-detail__section"><Text className="route-detail__heading">相关同行</Text>{rides.length ? rides.map((ride) => <View key={ride.id} className="route-detail__ride" onClick={() => { trackRouteEvent("route_related_rides_click", { route_id: route.id, ride_id: ride.id }); void Taro.navigateTo({ url: `/pages/rides/detail/index?id=${ride.id}` }); }}><View><Text className="route-detail__ride-title">{ride.title}</Text><Text className="route-detail__ride-meta">{new Date(ride.departure_time).toLocaleString()} · {ride.join_count}/{ride.max_people} 人</Text></View><Text>›</Text></View>) : <Text className="route-detail__copy">当前暂无有效相关同行</Text>}</View>
    <Text className="route-detail__updated">信息更新于 {new Date(route.updated_at).toLocaleDateString()}，出发前请复核天气和道路状况。</Text>
    <View className="route-detail__bottom"><View className="route-detail__favorite" onClick={() => void toggleFavorite()}>{favoriteSaving ? "处理中…" : route.is_favorited ? "★ 已收藏" : "☆ 收藏"}</View><View className="route-detail__primary" onClick={createFromRoute}>按此路线发起同行</View></View>
  </View>;
}
