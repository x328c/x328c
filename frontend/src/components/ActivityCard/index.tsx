import { Image, Text, View } from "@tarojs/components";
import { ACTIVITY_TYPES, FEE_TYPES } from "@/constants";
import { formatCountdown } from "@/utils/format";
import "./index.scss";
export interface ActivityCardData {
  id: string;
  cover_image?: string | null;
  title: string;
  activity_type: number;
  start_time: string;
  meetup_address: string;
  fee_type: number;
  fee_amount?: string | null;
  register_count: number;
  max_people: number;
}
export function ActivityCard({
  activity,
  onClick,
}: {
  activity: ActivityCardData;
  onClick?: () => void;
}) {
  const fee =
    activity.fee_type === 3
      ? `¥${activity.fee_amount}`
      : FEE_TYPES[activity.fee_type as keyof typeof FEE_TYPES];
  return (
    <View className="activity-card" onClick={onClick}>
      {activity.cover_image && (
        <Image
          className="activity-card__cover"
          src={activity.cover_image}
          mode="aspectFill"
        />
      )}
      <View className="activity-card__body">
        <Text className="activity-card__title">{activity.title}</Text>
        <Text>
          {
            ACTIVITY_TYPES[
              activity.activity_type as keyof typeof ACTIVITY_TYPES
            ]
          }{" "}
          · {formatCountdown(activity.start_time)}
        </Text>
        <Text>⌖ {activity.meetup_address}</Text>
        <Text>
          {fee} · {activity.register_count}/{activity.max_people || "不限"}人
        </Text>
      </View>
    </View>
  );
}
