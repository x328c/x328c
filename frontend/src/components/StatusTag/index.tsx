import { Text } from "@tarojs/components";
import { RIDE_STATUS } from "@/constants";
import "./index.scss";
export function StatusTag({
  status,
  full = false,
}: {
  status: number;
  full?: boolean;
}) {
  const item = full
    ? RIDE_STATUS.full
    : (RIDE_STATUS[status as keyof typeof RIDE_STATUS] ?? RIDE_STATUS[0]);
  return (
    <Text
      className="status-tag"
      style={{ color: item.color, borderColor: item.color }}
    >
      {item.text}
    </Text>
  );
}
