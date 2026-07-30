import dayjs from "dayjs";

/** 统一用于详情、卡片等绝对日期展示。 */
export function formatDateTime(value: string | Date): string {
  return dayjs(value).format("YYYY年M月D日 HH:mm");
}

export function formatRelativeTime(value: string | Date): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 172800) return "昨天";
  return `${Math.floor(seconds / 86400)}天前`;
}

export function formatCountdown(value: string | Date): string {
  const seconds = Math.max(
    0,
    Math.floor((new Date(value).getTime() - Date.now()) / 1000),
  );
  if (seconds === 0) return "已开始";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `还有${days}天${hours}小时`;
  if (hours) return `还有${hours}小时${minutes}分钟`;
  return `还有${minutes}分钟`;
}

export function formatDistance(kilometers: number | null | undefined): string {
  if (kilometers === null || kilometers === undefined) return "";
  return kilometers < 1
    ? `${Math.round(kilometers * 1000)}m`
    : `${kilometers.toFixed(kilometers < 10 ? 1 : 0)}km`;
}
