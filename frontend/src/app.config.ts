const tabBarList = [
  {
    pagePath: "pages/index/index",
    text: "同行助手",
    iconPath: "assets/tabbar/ride-v21.png",
    selectedIconPath: "assets/tabbar/ride-v21-selected.png",
  },
  {
    pagePath: "pages/routes/index",
    text: "路线",
    iconPath: "assets/tabbar/route.png",
    selectedIconPath: "assets/tabbar/route-selected.png",
  },
  {
    pagePath: "pages/messages/index",
    text: "助手通知",
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
    "pages/routes/create/index",
    "pages/routes/mine/index",
    "pages/routes/detail/index",
    "pages/routes/square/index",
    "pages/regions/select/index",
    "pages/map/select/index",
    "pages/rides/create/index",
    "pages/rides/detail/index",
    "pages/rides/participants/index",
    "pages/profile/edit/index",
    "pages/my/rides/index",
    "pages/settings/index",
    "pages/users/profile/index",
    "pages/messages/index",
    "pages/profile/index",
  ],
  subPackages: [
    {
      root: "packageRoutes",
      pages: ["pages/detail/index", "pages/select/index"],
    },
    {
      root: "packageRegulations",
      pages: ["pages/index/index", "pages/detail/index", "pages/source/index", "pages/accident-guide/index", "pages/safe-riding-initiative/index"],
    },
    {
      root: "packageLegal",
      pages: ["pages/document/index", "pages/safety-agreement/index"],
    },
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "摩搭子助手",
    navigationBarTextStyle: "black",
  },
  permission: {
    "scope.userLocation": {
      desc: "用于地图选择同行和路线地点，以及按集合地点距离排序和筛选",
    },
  },
  requiredPrivateInfos: ["getLocation", "chooseLocation"],
  tabBar: {
    color: "#8c8c8c",
    selectedColor: "#FF6A00",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: tabBarList,
  },
  lazyCodeLoading: "requiredComponents",
});
