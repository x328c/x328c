export const RIDE_STATUS = {
  0: { text: "已取消", color: "#8c8c8c" },
  1: { text: "报名中", color: "#1f7a4d" },
  2: { text: "即将出发", color: "#d97706" },
  3: { text: "进行中", color: "#2563eb" },
  4: { text: "已结束", color: "#64748b" },
  5: { text: "已下架", color: "#dc2626" },
  full: { text: "已满员", color: "#7c3aed" },
} as const;

export const RIDE_STYLES = {
  1: "跑山",
  2: "摩旅",
  3: "休闲骑",
  4: "通勤",
  5: "其他",
} as const;
export const ACTIVITY_TYPES = {
  1: "本地活动",
  2: "长途摩旅",
  3: "主题活动",
  4: "官方活动",
} as const;
export const FEE_TYPES = { 1: "免费", 2: "AA制", 3: "固定费用" } as const;
export const STORAGE_KEYS = {
  accessToken: "jiangxing_access_token",
  refreshToken: "jiangxing_refresh_token",
  user: "jiangxing_user",
} as const;
