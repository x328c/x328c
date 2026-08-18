export const RIDE_STATUS = {
  0: { text: "已取消", color: "#c62828" },
  1: { text: "报名中", color: "#237804" },
  2: { text: "即将出发", color: "#ad6800" },
  3: { text: "进行中", color: "#0958d9" },
  4: { text: "已结束", color: "#767676" },
  5: { text: "已下架", color: "#c62828" },
  full: { text: "已满员", color: "#ad6800" },
} as const;

export const RIDE_STYLES = {
  1: "跑山",
  2: "摩旅",
  3: "休闲骑",
  4: "通勤",
  5: "其他",
} as const;
export const STORAGE_KEYS = {
  accessToken: "jiangxing_access_token",
  refreshToken: "jiangxing_refresh_token",
  user: "jiangxing_user",
  loginReturnUrl: "modazi_login_return_url",
} as const;
