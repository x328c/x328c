import { Image, Input, Text, View } from "@tarojs/components";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { trackForumEvent } from "@/services/analytics";
import { forumIdempotencyKey, forumService } from "@/services/forum";
import { ApiError } from "@/services/request";
import { useUserStore } from "@/stores/user-store";
import type { ForumCapability, ForumPostDetail, ForumReply } from "@/types/api";
import { openLogin } from "@/utils/login-return";
import "./index.scss";

export default function ForumDetailPage() {
  const [id, setId] = useState(""); const [post, setPost] = useState<ForumPostDetail>(); const [replies, setReplies] = useState<ForumReply[]>([]); const [capability, setCapability] = useState<ForumCapability>();
  const [state, setState] = useState<"loading" | "ready" | "disabled" | "offline" | "pending" | "rejected" | "weak">("loading");
  const [reply, setReply] = useState(""); const [replying, setReplying] = useState(false); const [replyNotice, setReplyNotice] = useState(""); const [liking, setLiking] = useState(false); const [interactionError, setInteractionError] = useState("");

  const load = async (postId: string) => {
    setState("loading"); useUserStore.getState().hydrate();
    try {
      const [detail, replyResult, boardResult] = await Promise.all([forumService.detail(postId), forumService.replies(postId), forumService.boards()]);
      setPost(detail); setReplies(replyResult.items); setCapability(boardResult.capability); setState("ready"); trackForumEvent("forum_post_view", { post_id: postId });
    } catch (error) {
      if (error instanceof ApiError && error.code === 52001) setState("disabled");
      else if (error instanceof ApiError && (error.code === 53004 || error.status === 410)) setState("offline");
      else if (error instanceof ApiError && error.code === 53002) setState("pending");
      else if (error instanceof ApiError && error.code === 53003) setState("rejected");
      else setState("weak");
    }
  };
  useLoad((options) => { if (options.id) { setId(options.id); void load(options.id); } else setState("weak"); });
  useShareAppMessage(() => ({ title: post?.title || "摩搭子骑友论坛", path: `/packageForum/pages/detail/index?id=${post?.id || id}` }));

  const toggleLike = async () => {
    if (!post || liking) return; useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) { await openLogin(`/packageForum/pages/detail/index?id=${post.id}`); return; }
    const previous = post; const nextLiked = !post.liked; setPost({ ...post, liked: nextLiked, like_count: Math.max(0, post.like_count + (nextLiked ? 1 : -1)) }); setLiking(true); setInteractionError("");
    try { const result = nextLiked ? await forumService.like(post.id) : await forumService.unlike(post.id); setPost((current) => current ? { ...current, liked: result.liked, like_count: result.like_count } : current); trackForumEvent("forum_like", { post_id: post.id, liked: result.liked }); }
    catch (error) { setPost(previous); setInteractionError(error instanceof Error ? error.message : "点赞失败，请稍后重试"); }
    finally { setLiking(false); }
  };
  const submitReply = async () => {
    if (!post || replying || !reply.trim()) return; useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) { await openLogin(`/packageForum/pages/detail/index?id=${post.id}`); return; }
    if (!capability?.can_write) { setReplyNotice(capability?.reason === "muted" ? `禁言至 ${new Date(capability.restriction!.ends_at).toLocaleString()}：${capability.restriction!.reason}` : "当前不可回复"); return; }
    setReplying(true); setReplyNotice("");
    try { const result = await forumService.createReply(post.id, reply.trim(), forumIdempotencyKey("reply")); setReply(""); setReplyNotice(result.state.moderation_status === 1 ? "回复已公开" : result.state.moderation_status === 2 ? result.state.moderation_reason || "回复审核未通过" : result.state.manual_review_required ? "回复保持待审，已进入人工队列" : "回复审核中，通过后公开"); trackForumEvent("forum_reply_submit", { post_id: post.id, moderation_status: result.state.moderation_status }); }
    catch (error) { setReplyNotice(error instanceof Error ? error.message : "回复提交失败"); }
    finally { setReplying(false); }
  };
  const report = async (contentType: "forum_post" | "forum_reply" | "user", contentId: string) => {
    useUserStore.getState().hydrate(); if (!useUserStore.getState().isLoggedIn) { await openLogin(`/packageForum/pages/detail/index?id=${id}`); return; }
    const selected = await Taro.showActionSheet({ itemList: ["违法违规", "骚扰辱骂", "广告引流", "泄露隐私"] }).catch(() => undefined); if (!selected) return;
    try { await forumService.report({ content_type: contentType, content_id: contentId, reason: selected.tapIndex + 1 }); trackForumEvent("forum_report", { content_type: contentType, content_id: contentId }); Taro.showToast({ title: "举报已提交", icon: "success" }); }
    catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "举报失败", icon: "none" }); }
  };
  const more = async () => {
    if (!post) return; useUserStore.getState().hydrate(); const mine = useUserStore.getState().user?.id === post.author.id;
    const actions = mine ? ["删除帖子"] : ["举报帖子", "举报用户"];
    const selected = await Taro.showActionSheet({ itemList: actions }).catch(() => undefined); if (!selected) return;
    if (mine) { const confirm = await Taro.showModal({ title: "删除帖子", content: "删除后公开内容将立即隐藏，确定继续？" }); if (confirm.confirm) { await forumService.deletePost(post.id); await Taro.navigateBack(); } }
    else if (selected.tapIndex === 0) await report("forum_post", post.id); else await report("user", post.author.id);
  };
  const deleteReply = async (item: ForumReply) => { const confirm = await Taro.showModal({ title: "删除回复", content: "删除后无法恢复，确定继续？" }); if (!confirm.confirm) return; await forumService.deleteReply(item.id); setReplies((current) => current.filter((replyItem) => replyItem.id !== item.id)); };

  if (state === "loading") return <View className="forum-detail"><StatePanel type="loading" title="正在加载帖子" /></View>;
  if (state === "disabled") return <View className="forum-detail"><StatePanel type="disabled" title="论坛功能已关闭" description="约骑与路线不受影响" actionText="返回约骑" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /></View>;
  if (state === "offline") return <View className="forum-detail"><StatePanel type="disabled" title="帖子已失效或下架" description="后台处置后不会继续展示缓存内容" actionText="返回论坛" onAction={() => Taro.navigateBack()} /></View>;
  if (state === "pending") return <View className="forum-detail"><StatePanel type="pending" title="帖子正在审核中" description="文字和图片全部通过前不会公开" actionText="查看我的发布" onAction={() => Taro.redirectTo({ url: "/packageForum/pages/my/index" })} /></View>;
  if (state === "rejected") return <View className="forum-detail"><StatePanel type="unauthorized" title="帖子审核未通过" description="请从我的发布查看原因并修改" actionText="查看我的发布" onAction={() => Taro.redirectTo({ url: "/packageForum/pages/my/index" })} /></View>;
  if (state === "weak" || !post) return <View className="forum-detail"><StatePanel type="offline" title="网络连接较弱" description="未展示可能过期的帖子内容" actionText="重新加载" onAction={() => void load(id)} /></View>;
  return <View className="forum-detail">
    <View className="forum-detail__post"><View className="forum-detail__top"><Text className="forum-detail__board">{post.board.name}</Text><Text onClick={() => void more()}>•••</Text></View><Text className="forum-detail__title">{post.title}</Text><Text className="forum-detail__author">{post.author.nickname} · {new Date(post.published_at || post.created_at).toLocaleString()}</Text><Text className="forum-detail__content" selectable>{post.content}</Text><View className="forum-detail__images">{post.images.map((image) => <Image key={image.id} className="forum-detail__image" src={image.url} mode="widthFix" onClick={() => Taro.previewImage({ current: image.url, urls: post.images.map((item) => item.url) })} />)}</View></View>
    <View className="forum-detail__interaction"><View className={post.liked ? "forum-detail__like forum-detail__like--active" : "forum-detail__like"} onClick={() => void toggleLike()}>{post.liked ? "♥" : "♡"} {post.like_count}</View><Text>{post.reply_count} 条公开回复</Text></View>{interactionError ? <Text className="forum-detail__error">{interactionError}</Text> : null}
    <View className="forum-detail__replies"><Text className="forum-detail__heading">一级回复</Text>{!replies.length ? <StatePanel type="empty" title="暂无公开回复" description="待审核回复不会提前显示" /> : replies.map((item) => <View className="forum-reply" key={item.id}><View className="forum-reply__meta"><Text>{item.author.nickname}</Text><Text>{new Date(item.published_at || item.created_at).toLocaleString()}</Text></View><Text className="forum-reply__content">{item.content}</Text><View className="forum-reply__actions">{useUserStore.getState().user?.id === item.author.id ? <Text onClick={() => void deleteReply(item)}>删除</Text> : <><Text onClick={() => void report("forum_reply", item.id)}>举报回复</Text><Text onClick={() => void report("user", item.author.id)}>举报用户</Text></>}</View></View>)}</View>
    <View className="forum-detail__composer"><Input className="forum-detail__input" value={reply} maxlength={1000} placeholder={capability?.reason === "muted" ? "你当前处于禁言状态" : "写下一级回复，审核后公开"} disabled={!capability?.can_write} onInput={(event) => setReply(event.detail.value)} /><View className={replying ? "forum-detail__send forum-detail__send--disabled" : "forum-detail__send"} onClick={() => void submitReply()}>{replying ? "提交中" : "回复"}</View></View>{replyNotice ? <Text className="forum-detail__notice">{replyNotice}</Text> : null}
  </View>;
}
