import { Text, View } from "@tarojs/components";
import "./index.scss";
export function ConfirmDialog({
  visible,
  title,
  content,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  content: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <View className="confirm">
      <View className="confirm__mask" onClick={onCancel} />
      <View className="confirm__panel">
        <Text className="confirm__title">{title}</Text>
        <Text className="confirm__content">{content}</Text>
        <View className="confirm__actions">
          <Text onClick={onCancel}>取消</Text>
          <Text className="confirm__primary" onClick={onConfirm}>
            确定
          </Text>
        </View>
      </View>
    </View>
  );
}
