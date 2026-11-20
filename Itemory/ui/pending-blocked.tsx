import { Image, Spacer, Text, VStack } from "scripting";

import { StartupActionButton } from "./startup-action";

export function PendingBlockedPage(props: {
  count: number;
  recoverableCount?: number;
  corruptCount?: number;
  checking?: boolean;
  error?: string | null;
  onRetry: () => void;
  onBrowse?: () => void;
  onQuarantineCorrupt?: () => void;
}) {
  const checking = props.checking ?? false;
  const recoverableCount = props.recoverableCount ?? 0;
  const corruptCount = props.corruptCount ?? 0;

  return (
    <VStack
      alignment="center"
      spacing={18}
      padding={24}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Spacer />
      <Image
        systemName="exclamationmark.triangle.fill"
        font={44}
        foregroundStyle="systemOrange"
      />
      <Text font="title2" fontWeight="semibold" multilineTextAlignment="center">
        {checking ? "正在核对待确认操作" : "有操作结果待确认"}
      </Text>
      <Text multilineTextAlignment="center" foregroundStyle="secondaryLabel">
        {checking
          ? "正在核对上次写入结果，核对完成前不会开放新的写入。"
          : corruptCount > 0
            ? `发现 ${corruptCount} 份损坏的待决记录。为避免误删已提交数据，当前数据保持锁定。`
            : recoverableCount > 0
              ? `检测到 ${recoverableCount} 笔尚无提交凭据的操作。无法证明原实例已停止，不能自动解除。`
              : `检测到 ${props.count} 笔结果仍可能变化的写入。为避免重复保存，当前数据已锁定新写入，请稍后重新核对。`}
      </Text>
      {props.error ? (
        <Text
          font="footnote"
          multilineTextAlignment="center"
          foregroundStyle="systemRed"
        >
          {props.error}
        </Text>
      ) : null}
      <VStack spacing={10} frame={{ maxWidth: 280 }}>
        <StartupActionButton
          title={checking ? "核对中..." : "重新核对"}
          prominent={true}
          disabled={checking}
          action={props.onRetry}
        />
        {props.onBrowse ? (
          <StartupActionButton
            title="只读浏览数据"
            disabled={checking}
            action={props.onBrowse}
            />
        ) : null}
        {!checking && corruptCount > 0 && props.onQuarantineCorrupt ? (
          <StartupActionButton
            title="隔离损坏记录并重新核对"
            disabled={checking}
            role="destructive"
            action={props.onQuarantineCorrupt}
            />
        ) : null}
      </VStack>
      <Spacer />
    </VStack>
  );
}
