import { Image, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { trackForumEvent } from "@/services/analytics";
import { forumIdempotencyKey, forumService } from "@/services/forum";
import { ApiError } from "@/services/request";
import { useUserStore } from "@/stores/user-store";
import type { ForumBoard, ForumSubmitState } from "@/types/api";
import { uploadForumImage, type UploadedImage } from "@/utils/upload";
import "./index.scss";

export default function ForumCreatePage() {
  const [boards, setBoards] = useState<ForumBoard[]>([]); const [boardId, setBoardId] = useState("");
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [images, setImages] = useState<UploadedImage[]>([]);
  const [editingId, setEditingId] = useState(""); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ForumSubmitState>(); const [state, setState] = useState<"loading" | "ready" | "disabled" | "error">("loading");

  useLoad((options) => {
    useUserStore.getState().hydrate();
    void forumService.boards().then(async (data) => {
      if (!data.capability.can_write) { setState("disabled"); return; }
      setBoards(data.items); setBoardId(data.items[0]?.id || "");
      if (options.id) {
        const mine = await forumService.myPosts(); const post = mine.items.find((item) => item.id === options.id);
        if (!post || ![0, 2].includes(post.moderation_status) || post.status !== 1) throw new Error("当前帖子不可编辑");
        setEditingId(post.id); setBoardId(post.board.id); setTitle(post.title); setContent(post.content || ""); setImages(post.images.map((image) => ({ id: image.id, url: image.url })));
      }
      setState("ready");
    }).catch((error) => setState(error instanceof ApiError && error.code === 52001 ? "disabled" : "error"));
  });

  const chooseImages = async () => {
    if (uploading || images.length >= 9) return;
    const selected = await Taro.chooseMedia({ count: 9 - images.length, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"] }).catch(() => undefined);
    if (!selected?.tempFiles.length) return;
    setUploading(true);
    try {
      const uploaded: UploadedImage[] = [];
      for (const file of selected.tempFiles) uploaded.push(await uploadForumImage(file.tempFilePath));
      setImages((current) => [...current, ...uploaded]);
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "图片上传失败", icon: "none" }); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (busy || uploading) return;
    if (!boardId || Array.from(title.trim()).length < 5 || Array.from(content.trim()).length < 10) { Taro.showToast({ title: "请完整填写标题和正文", icon: "none" }); return; }
    setBusy(true);
    try {
      const payload = { board_id: boardId, title: title.trim(), content: content.trim(), image_ids: images.map((image) => image.id) };
      const response = editingId ? await forumService.updatePost(editingId, payload, forumIdempotencyKey("post-edit")) : await forumService.createPost(payload, forumIdempotencyKey("post"));
      setResult(response.state); trackForumEvent("forum_post_submit", { post_id: response.id, moderation_status: response.state.moderation_status });
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "提交失败", icon: "none", duration: 2500 }); }
    finally { setBusy(false); }
  };

  if (state === "loading") return <View className="forum-create"><StatePanel type="loading" title="正在准备发布页" /></View>;
  if (state === "disabled") return <View className="forum-create"><StatePanel type="disabled" title="当前不能发布" description="论坛处于只读、受邀或禁言状态；公开内容仍可浏览" actionText="返回论坛" onAction={() => Taro.navigateBack()} /></View>;
  if (state === "error") return <View className="forum-create"><StatePanel type="offline" title="发布页加载失败" actionText="返回论坛" onAction={() => Taro.navigateBack()} /></View>;
  if (result) return <View className="forum-create"><StatePanel type={result.moderation_status === 1 ? "empty" : result.moderation_status === 2 ? "unauthorized" : "pending"} title={result.moderation_status === 1 ? "帖子已公开" : result.moderation_status === 2 ? "帖子审核未通过" : "帖子已提交审核"} description={result.moderation_status === 2 ? result.moderation_reason || "请修改后重新提交" : result.manual_review_required ? "自动审核暂不可用，内容保持待审并已进入人工队列" : "文字和图片全部通过后才会公开"} actionText="查看我的发布" onAction={() => Taro.redirectTo({ url: "/packageForum/pages/my/index" })} /></View>;
  return <View className="forum-create">
    <View className="forum-create__notice">请勿发布违法内容、联系方式引流、交易信息或他人隐私。正文只支持纯文本。</View>
    <View className="forum-create__section"><Text className="forum-create__label">板块</Text><View className="forum-create__boards">{boards.map((board) => <View key={board.id} className={boardId === board.id ? "forum-create__board forum-create__board--active" : "forum-create__board"} onClick={() => setBoardId(board.id)}>{board.name}</View>)}</View></View>
    <View className="forum-create__section"><Text className="forum-create__label">标题（5-50 字）</Text><Input className="forum-create__input" value={title} maxlength={50} placeholder="清晰描述想交流的话题" onInput={(event) => setTitle(event.detail.value)} /></View>
    <View className="forum-create__section"><Text className="forum-create__label">正文（10-3000 字）</Text><Textarea className="forum-create__textarea" value={content} maxlength={3000} placeholder="分享真实经历和有帮助的信息" onInput={(event) => setContent(event.detail.value)} /><Text className="forum-create__count">{Array.from(content).length}/3000</Text></View>
    <View className="forum-create__section"><Text className="forum-create__label">图片（0-9 张）</Text><View className="forum-create__images">{images.map((image, index) => <View className="forum-create__image-wrap" key={image.id}><Image className="forum-create__image" src={image.url} mode="aspectFill" /><View className="forum-create__remove" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</View></View>)}{images.length < 9 ? <View className="forum-create__add" onClick={() => void chooseImages()}>{uploading ? "上传中" : "+ 图片"}</View> : null}</View></View>
    <View className={busy || uploading ? "forum-create__submit forum-create__submit--disabled" : "forum-create__submit"} onClick={() => void submit()}>{busy ? "提交中…" : editingId ? "修改并重新审核" : "提交审核"}</View>
  </View>;
}
