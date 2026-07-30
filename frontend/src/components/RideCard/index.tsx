import { Image, Text, View } from "@tarojs/components";
import { RIDE_STYLES } from "@/constants";
import type { RideSummary } from "@/types/api";
import { formatCountdown, formatDistance } from "@/utils/format";
import { StatusTag } from "../StatusTag";
import "./index.scss";
export type RideCardData = RideSummary;
export function RideCard({
  ride,
  onClick,
}: {
  ride: RideCardData;
  onClick?: () => void;
}) {
  return (
    <View className="ride-card" onClick={onClick}>
      <View className="ride-card__head">
        <View>
          <Text className="ride-card__title">{ride.title}</Text>
          <Text className="ride-card__meta">
            {RIDE_STYLES[ride.ride_style as keyof typeof RIDE_STYLES]}
          </Text>
        </View>
        <StatusTag status={ride.status} full={ride.is_full} />
      </View>
      <Text className="ride-card__line">
        ⏰ {formatCountdown(ride.departure_time)}
      </Text>
      <Text className="ride-card__line">⌖ {ride.meetup_address}</Text>
      <View className="ride-card__foot">
        {ride.creator.avatar_url ? (
          <Image className="ride-card__avatar" src={ride.creator.avatar_url} />
        ) : (
          <View className="ride-card__avatar ride-card__avatar--placeholder">
            {ride.creator.nickname.slice(0, 1)}
          </View>
        )}
        <Text>
          {ride.creator.nickname} ·{" "}
          {ride.creator.motorcycle_model ?? "车型待补充"}
        </Text>
        <Text>
          {ride.join_count}/{ride.max_people}人 {formatDistance(ride.distance)}
        </Text>
      </View>
    </View>
  );
}
