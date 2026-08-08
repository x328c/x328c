import { Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";
import { SourceBlock, StatePanel } from "@/components";
import { trackRegulationEvent } from "@/services/analytics";
import { ApiError } from "@/services/request";
import { regulationService } from "@/services/regulations";
import { useUserStore } from "@/stores/user-store";
import type { RegulationDetail } from "@/types/api";
import { openLogin } from "@/utils/login-return";
import "./index.scss";

const statusName = { 2: "现行有效", 3: "已失效", 4: "已替代" } as const;
const feedbackTypes = ["content_error", "expired", "link_broken"] as const;
const feedbackLabels = { content_error: "内容错误", expired: "疑似过期", link_broken: "官方链接失效" } as const;

export default function RegulationDetailPage() {
  const [item, setItem] = useState<RegulationDetail>(); const [id, setId] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error" | "disabled" | "offline">("loading");
  const [feedbackType, setFeedbackType] = useState<(typeof feedbackTypes)[number]>();
  const [feedbackDescription, setFeedbackDescription] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const load = async (nextId: string) => { setState("loading"); try { setItem(await regulationService.detail(nextId)); setState("ready"); } catch (error) { if (error instanceof ApiError && error.code === 52001) setState("disabled"); else if (error instanceof ApiError && error.status === 410) setState("offline"); else setState("error"); } };
  useLoad((options) => { useUserStore.getState().hydrate(); if (options.id) { setId(options.id); void load(options.id); } else setState("error"); });
  useShareAppMessage(() => ({ title: item?.title ?? "摩搭子法规索引", path: `/packageRegulations/pages/detail/index?id=${item?.id ?? id}` }));
  const feedback = async () => {
    if (!item) return;
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) { await openLogin(`/packageRegulations/pages/detail/index?id=${item.id}`); return; }
    const selected = await Taro.showActionSheet({ itemList: ["内容错误", "疑似过期", "官方链接失效"] }).catch(() => undefined);
    if (!selected) return;
    setFeedbackType(feedbackTypes[selected.tapIndex]); setFeedbackDescription("");
  };
  const submitFeedback = async () => {
    if (!item || !feedbackType || submittingFeedback) return;
    setSubmittingFeedback(true);
    try {
      await regulationService.feedback(item.id, { type: feedbackType, description: feedbackDescription.trim() || undefined });
      trackRegulationEvent("regulation_feedback", { regulation_id: item.id, type: feedbackType });
      setFeedbackType(undefined); setFeedbackDescription("");
      Taro.showToast({ title: "已进入纠错处理队列", icon: "success" });
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "提交失败", icon: "none" }); }
    finally { setSubmittingFeedback(false); }
  };
  if (state === "loading") return <View className="regulation-detail"><StatePanel type="loading" title="正在加载法规" /></View>;
  if (state === "disabled") return <View className="regulation-detail"><StatePanel type="disabled" title="法规检索暂未开放" description="路线与约骑不受影响" actionText="返回约骑" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /></View>;
  if (state === "offline") return <View className="regulation-detail"><StatePanel type="offline" title="该法规条目已下架" description="来源字段仍保留，公开索引已停止展示正文" actionText="返回法规检索" onAction={() => Taro.navigateBack()} /></View>;
  if (state === "error" || !item) return <View className="regulation-detail"><StatePanel type="error" actionText="重新加载" onAction={() => void load(id)} /></View>;
  return <View className="regulation-detail">
    {item.status !== 2 ? <View className="regulation-detail__banner regulation-detail__banner--inactive">{item.status === 3 ? "该条目已失效" : "该条目已被替代"}{item.replacement ? `，替代文件：${item.replacement.title}` : "，请核对最新官方文件"}</View> : null}
    {item.review_overdue ? <View className="regulation-detail__banner">该信息已超过复核周期，请优先核对官方原文。</View> : null}
    <View className="regulation-detail__header"><Text className={`regulation-detail__status regulation-detail__status--${item.status}`}>{statusName[item.status]}</Text><Text className="regulation-detail__title">{item.title}</Text><Text className="regulation-detail__meta">{item.document_no || `无文号：${item.document_no_empty_reason}`}</Text><View className="regulation-detail__facts"><Text>适用：{item.scope === "NATIONAL" ? "全国" : item.regions.map((region) => region.name).join("、")}</Text><Text>生效：{item.effective_at ? new Date(item.effective_at).toLocaleDateString() : item.effective_note}</Text><Text>复核：{item.last_verified_at ? new Date(item.last_verified_at).toLocaleDateString() : "待复核"}</Text></View></View>
    <View className="regulation-detail__source"><SourceBlock regulation={item} /></View>
    <View className="regulation-detail__section"><Text className="regulation-detail__heading">摘要</Text><Text className="regulation-detail__copy" selectable>{item.summary}</Text></View>
    <View className="regulation-detail__section"><Text className="regulation-detail__heading">索引正文</Text><Text className="regulation-detail__copy regulation-detail__content" selectable>{item.content}</Text></View>
    <View className="regulation-detail__section"><Text className="regulation-detail__heading">修订记录</Text>{item.revision_history.map((revision) => <Text className="regulation-detail__revision" key={revision.id}>v{revision.version} · {revision.change_note} · {revision.published_at ? new Date(revision.published_at).toLocaleDateString() : "未发布"}</Text>)}</View>
    <Text className="regulation-detail__disclaimer">{item.disclaimer}</Text>
    <View className="regulation-detail__feedback" onClick={() => void feedback()}>发现错误？提交纠错反馈</View>
    {feedbackType ? <View className="regulation-detail__feedback-mask" onClick={() => setFeedbackType(undefined)}><View className="regulation-detail__feedback-sheet" onClick={(event) => event.stopPropagation()}>
      <Text className="regulation-detail__feedback-title">{feedbackLabels[feedbackType]}</Text>
      <Text className="regulation-detail__feedback-hint">反馈将进入人工处理队列，不会自动修改法规内容。</Text>
      <Textarea className="regulation-detail__feedback-input" value={feedbackDescription} maxlength={500} placeholder="请补充发现的问题或打不开链接时的现象（可选）" onInput={(event) => setFeedbackDescription(event.detail.value)} />
      <View className="regulation-detail__feedback-actions"><View onClick={() => setFeedbackType(undefined)}>取消</View><View className="regulation-detail__feedback-submit" onClick={() => void submitFeedback()}>{submittingFeedback ? "提交中…" : "提交反馈"}</View></View>
    </View></View> : null}
  </View>;
}
