import { View } from "@tarojs/components";
import "./index.scss";
export function Skeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <View className="skeleton-card" key={index}>
          <View className="skeleton-card__line skeleton-card__line--title" />
          <View className="skeleton-card__line" />
          <View className="skeleton-card__line skeleton-card__line--short" />
        </View>
      ))}
    </>
  );
}
