import { Button, Text, View } from "@tarojs/components";
import "./index.scss";
export function Empty({
  text = "暂无内容",
  actionText,
  onAction,
}: {
  text?: string;
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <View className="empty">
      <Text className="empty__icon">◌</Text>
      <Text className="empty__text">{text}</Text>
      {actionText && (
        <Button className="empty__button" size="mini" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </View>
  );
}
