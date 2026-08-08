import { Button, Text, View } from "@tarojs/components";
import "./index.scss";

export type StatePanelType =
  | "loading"
  | "empty"
  | "error"
  | "unauthorized"
  | "pending"
  | "offline"
  | "disabled";

interface StatePanelProps {
  type: StatePanelType;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

const defaults: Record<StatePanelType, { icon: string; title: string; description: string }> = {
  loading: { icon: "…", title: "正在加载", description: "请稍候" },
  empty: { icon: "○", title: "暂无内容", description: "稍后再来看看" },
  error: { icon: "!", title: "加载失败", description: "请检查网络后重试" },
  unauthorized: { icon: "锁", title: "暂无权限", description: "当前账号无法查看此内容" },
  pending: { icon: "时", title: "等待审核", description: "审核完成前不会公开展示" },
  offline: { icon: "断", title: "网络不可用", description: "恢复网络后再试" },
  disabled: { icon: "备", title: "功能准备中", description: "当前版本尚未开放" },
};

export function StatePanel({
  type,
  title,
  description,
  actionText,
  onAction,
}: StatePanelProps) {
  const content = defaults[type];

  return (
    <View className={`state-panel state-panel--${type}`} role="status">
      <View className="state-panel__icon" aria-hidden>
        {content.icon}
      </View>
      <Text className="state-panel__title">{title ?? content.title}</Text>
      <Text className="state-panel__description">{description ?? content.description}</Text>
      {actionText && onAction ? (
        <Button className="state-panel__action" onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
    </View>
  );
}
