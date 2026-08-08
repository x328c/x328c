import { Image, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { StatePanel } from "@/components";
import { trackForumEvent } from "@/services/analytics";
import { forumService } from "@/services/forum";
import { ApiError } from "@/services/request";
import { useUserStore } from "@/stores/user-store";
import type { ForumBoard, ForumCapability, ForumPostSummary } from "@/types/api";
import { openLogin } from "@/utils/login-return";
import "./index.scss";

function PostCard({ post }: { post: ForumPostSummary }) {
  return <View className="forum-card" onClick={() => void Taro.navigateTo({ url: `/packageForum/pages/detail/index?id=${post.id}` })}>
    <View className="forum-card__meta"><Text>{post.board.name}</Text><Text>{new Date(post.published_at || post.created_at).toLocaleDateString()}</Text></View>
    <Text className="forum-card__title">{post.title}</Text>
    <Text className="forum-card__excerpt">{post.excerpt}</Text>
    {post.images[0] ? <Image className="forum-card__cover" src={post.images[0].url} mode="aspectFill" /> : null}
    <View className="forum-card__footer"><Text>{post.author.nickname}</Text><Text>♡ {post.like_count}　回复 {post.reply_count}</Text></View>
  </View>;
}

export default function ForumPage() {
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [capability, setCapability] = useState<ForumCapability>();
  const [posts, setPosts] = useState<ForumPostSummary[]>([]);
  const [boardId, setBoardId] = useState<string>();
  const [sort, setSort] = useState<"latest" | "hot">("latest");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "disabled" | "offline">("loading");

  const load = useCallback(async (nextBoard?: string, nextSort: "latest" | "hot" = sort, append = false) => {
    if (!append) setState("loading");
    useUserStore.getState().hydrate();
    try {
      const [boardResult, postResult] = await Promise.all([
        forumService.boards(),
        forumService.posts({ board_id: nextBoard, sort: nextSort, cursor: append ? cursor || undefined : undefined, limit: 20 }),
      ]);
      setBoards(boardResult.items); setCapability(boardResult.capability);
      setPosts((current) => append ? [...current, ...postResult.items] : postResult.items);
      setCursor(postResult.nextCursor); setHasMore(postResult.hasMore); setState("ready");
      trackForumEvent("forum_module_exposure", { board_id: nextBoard || "all", sort: nextSort, result_count: postResult.items.length });
    } catch (error) {
      setState(error instanceof ApiError && error.code === 52001 ? "disabled" : "offline");
    } finally { Taro.stopPullDownRefresh(); }
  }, [cursor, sort]);

  useDidShow(() => void load(boardId, sort));
  usePullDownRefresh(() => void load(boardId, sort));
  useReachBottom(() => { if (hasMore && cursor) void load(boardId, sort, true); });

  const chooseBoard = (id?: string) => { setBoardId(id); void load(id, sort); };
  const chooseSort = (value: "latest" | "hot") => { setSort(value); void load(boardId, value); };
  const create = async () => {
    useUserStore.getState().hydrate();
    if (!useUserStore.getState().isLoggedIn) { await openLogin("/pages/forum/index"); return; }
    if (!capability?.can_write) {
      const title = capability?.reason === "muted" ? `禁言至 ${new Date(capability.restriction!.ends_at).toLocaleString()}\n${capability.restriction!.reason}` : capability?.reason === "not_invited" ? "论坛当前仅限受邀用户发帖" : "论坛当前为只读浏览";
      await Taro.showModal({ title: "暂时无法发帖", content: title, showCancel: false }); return;
    }
    await Taro.navigateTo({ url: "/packageForum/pages/create/index" });
  };

  if (state === "loading") return <View className="forum-page"><StatePanel type="loading" title="正在加载论坛" /></View>;
  if (state === "disabled") return <View className="forum-page"><StatePanel type="disabled" title="论坛暂未开放" description="资质或服务开关未满足，约骑与路线仍可正常使用" actionText="返回约骑" onAction={() => Taro.switchTab({ url: "/pages/index/index" })} /></View>;
  if (state === "offline") return <View className="forum-page"><StatePanel type="offline" title="网络连接较弱" description="未加载任何可能过期的论坛内容" actionText="重新加载" onAction={() => void load(boardId, sort)} /></View>;
  return <View className="forum-page">
    <View className="forum-page__hero"><View><Text className="forum-page__title">骑友论坛</Text><Text className="forum-page__subtitle">文明交流，所有公开内容均经过审核</Text></View><View className="forum-page__mine" onClick={() => useUserStore.getState().isLoggedIn ? void Taro.navigateTo({ url: "/packageForum/pages/my/index" }) : void openLogin("/pages/forum/index")}>我的发布</View></View>
    {!capability?.can_write && capability?.reason !== "login_required" ? <View className="forum-page__notice">{capability?.reason === "muted" ? `禁言至 ${new Date(capability.restriction!.ends_at).toLocaleString()}：${capability.restriction!.reason}` : capability?.reason === "not_invited" ? "当前为受邀用户发布，所有用户均可浏览" : "当前为只读浏览，公开内容不受影响"}</View> : null}
    <ScrollView scrollX className="forum-page__boards"><View className="forum-page__board-row"><View className={!boardId ? "forum-page__board forum-page__board--active" : "forum-page__board"} onClick={() => chooseBoard()}>全部</View>{boards.map((board) => <View key={board.id} className={boardId === board.id ? "forum-page__board forum-page__board--active" : "forum-page__board"} onClick={() => chooseBoard(board.id)}><Text>{board.name}</Text><Text className="forum-page__board-desc">{board.description}</Text></View>)}</View></ScrollView>
    <View className="forum-page__toolbar"><View><Text className={sort === "latest" ? "forum-page__sort forum-page__sort--active" : "forum-page__sort"} onClick={() => chooseSort("latest")}>最新</Text><Text className={sort === "hot" ? "forum-page__sort forum-page__sort--active" : "forum-page__sort"} onClick={() => chooseSort("hot")}>热门</Text></View><View className="forum-page__create" onClick={() => void create()}>＋ 发帖</View></View>
    {!posts.length ? <StatePanel type="empty" title="板块还没有公开帖子" description="待审核内容不会提前展示" /> : <View className="forum-page__list">{posts.map((post) => <PostCard key={post.id} post={post} />)}<Text className="forum-page__end">{hasMore ? "上拉加载更多" : "已展示全部公开帖子"}</Text></View>}
  </View>;
}
