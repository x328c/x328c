import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { StatePanel } from "@/components";
import { forumService } from "@/services/forum";
import { ApiError } from "@/services/request";
import type { ForumPostSummary, ForumReply } from "@/types/api";
import "./index.scss";

const moderationName = { 0: "审核中", 1: "已公开", 2: "已驳回" } as const;
export default function ForumMinePage() {
  const [posts, setPosts] = useState<ForumPostSummary[]>([]); const [replies, setReplies] = useState<Array<ForumReply & { post: { id: string; title: string; available: boolean } }>>([]); const [tab, setTab] = useState<"posts" | "replies">("posts"); const [state, setState] = useState<"loading" | "ready" | "disabled" | "offline">("loading");
  const load = async () => { setState("loading"); try { const [postResult, replyResult] = await Promise.all([forumService.myPosts(), forumService.myReplies()]); setPosts(postResult.items); setReplies(replyResult.items); setState("ready"); } catch (error) { setState(error instanceof ApiError && error.code === 52001 ? "disabled" : "offline"); } };
  useDidShow(() => void load());
  if (state === "loading") return <View className="forum-mine"><StatePanel type="loading" title="正在加载我的发布" /></View>;
  if (state === "disabled") return <View className="forum-mine"><StatePanel type="disabled" title="论坛功能已关闭" actionText="返回" onAction={() => Taro.navigateBack()} /></View>;
  if (state === "offline") return <View className="forum-mine"><StatePanel type="offline" title="网络连接较弱" actionText="重新加载" onAction={() => void load()} /></View>;
  const items = tab === "posts" ? posts : replies;
  return <View className="forum-mine"><View className="forum-mine__tabs"><Text className={tab === "posts" ? "forum-mine__tab forum-mine__tab--active" : "forum-mine__tab"} onClick={() => setTab("posts")}>帖子</Text><Text className={tab === "replies" ? "forum-mine__tab forum-mine__tab--active" : "forum-mine__tab"} onClick={() => setTab("replies")}>回复</Text></View>{!items.length ? <StatePanel type="empty" title="暂无发布记录" /> : <View className="forum-mine__list">{tab === "posts" ? posts.map((item) => <View className="forum-mine__card" key={item.id}><View className="forum-mine__top"><Text>{item.board.name}</Text><Text className={`forum-mine__status forum-mine__status--${item.moderation_status}`}>{item.status === 2 ? "已下架" : moderationName[item.moderation_status]}</Text></View><Text className="forum-mine__title">{item.title}</Text>{item.moderation_reason ? <Text className="forum-mine__reason">原因：{item.moderation_reason}</Text> : null}{item.moderation_error ? <Text className="forum-mine__warning">自动审核异常，内容保持待审并已进入人工队列</Text> : null}<View className="forum-mine__actions">{item.status === 1 && [0, 2].includes(item.moderation_status) ? <Text onClick={() => Taro.navigateTo({ url: `/packageForum/pages/create/index?id=${item.id}` })}>修改重提</Text> : null}{item.moderation_status === 1 && item.status === 1 ? <Text onClick={() => Taro.navigateTo({ url: `/packageForum/pages/detail/index?id=${item.id}` })}>查看公开页</Text> : null}</View></View>) : replies.map((item) => <View className="forum-mine__card" key={item.id}><View className="forum-mine__top"><Text>{item.post.title}</Text><Text className={`forum-mine__status forum-mine__status--${item.moderation_status}`}>{item.status === 2 ? "已下架" : moderationName[item.moderation_status]}</Text></View><Text className="forum-mine__copy">{item.content}</Text>{item.moderation_reason ? <Text className="forum-mine__reason">原因：{item.moderation_reason}</Text> : null}</View>)}</View>}</View>;
}
