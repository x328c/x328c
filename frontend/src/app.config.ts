const includeForumTab = process.env.TARO_APP_TAB_VARIANT === "5";

const tabBarList = [
  {
    pagePath: "pages/index/index",
    text: "约骑",
    iconPath: "assets/tabbar/ride.png",
    selectedIconPath: "assets/tabbar/ride-selected.png",
  },
  {
    pagePath: "pages/routes/index",
    text: "路线",
    iconPath: "assets/tabbar/route.png",
    selectedIconPath: "assets/tabbar/route-selected.png",
  },
  ...(includeForumTab
    ? [
        {
          pagePath: "pages/forum/index",
          text: "论坛",
          iconPath: "assets/tabbar/forum.png",
          selectedIconPath: "assets/tabbar/forum-selected.png",
        },
      ]
    : []),
  {
    pagePath: "pages/messages/index",
    text: "消息",
    iconPath: "assets/tabbar/messages.png",
    selectedIconPath: "assets/tabbar/messages-selected.png",
  },
  {
    pagePath: "pages/profile/index",
    text: "我的",
    iconPath: "assets/tabbar/profile.png",
    selectedIconPath: "assets/tabbar/profile-selected.png",
  },
];

export default defineAppConfig({
  pages: [
    "pages/auth/index",
    "pages/index/index",
    "pages/routes/index",
    ...(includeForumTab ? ["pages/forum/index"] : []),
    "pages/rides/create/index",
    "pages/rides/detail/index",
    "pages/rides/participants/index",
    "pages/activities/index",
    "pages/activities/detail/index",
    "pages/activities/create/index",
    "pages/profile/edit/index",
    "pages/my/rides/index",
    "pages/my/activities/index",
    "pages/settings/index",
    "pages/users/profile/index",
    "pages/messages/index",
    "pages/profile/index",
  ],
  subPackages: [
    {
      root: "packageRoutes",
      pages: ["pages/detail/index"],
    },
    {
      root: "packageRegulations",
      pages: ["pages/index/index", "pages/detail/index", "pages/source/index"],
    },
    {
      root: "packageForum",
      pages: ["pages/detail/index", "pages/create/index", "pages/my/index"],
    },
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "摩搭子助手",
    navigationBarTextStyle: "black",
  },
  tabBar: {
    color: "#8c8c8c",
    selectedColor: "#FF6A00",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: tabBarList,
  },
});
