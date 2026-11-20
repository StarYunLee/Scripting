import { Image, Spacer, Text, VStack, type Color } from "scripting";

import { StartupActionButton } from "./startup-action";

function StartupContent(props: {
  systemImage: string;
  iconColor: Color;
  title: string;
  description: string;
  detail?: string;
  checking: boolean;
  retryTitle: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <VStack
      spacing={20}
      padding={24}
      frame={{ maxWidth: 420, maxHeight: "infinity", alignment: "center" }}
      alignment="center"
    >
      <Spacer />
      <Image
        systemName={props.systemImage}
        font={44}
        foregroundStyle={props.iconColor}
      />
      <VStack alignment="center" spacing={10}>
        <Text font="title2" fontWeight="semibold" multilineTextAlignment="center">
          {props.title}
        </Text>
        <Text
          foregroundStyle="secondaryLabel"
          multilineTextAlignment="center"
          lineSpacing={3}
        >
          {props.description}
        </Text>
      </VStack>
      {props.detail ? (
        <Text
          font="footnote"
          foregroundStyle="secondaryLabel"
          multilineTextAlignment="center"
          lineLimit={4}
        >
          {props.detail}
        </Text>
      ) : null}
      <VStack spacing={10} frame={{ maxWidth: "infinity", alignment: "center" }}>
        <StartupActionButton
          title={props.checking ? "正在检查..." : props.retryTitle}
          prominent={true}
          disabled={props.checking}
          action={props.onRetry}
        />
        <StartupActionButton title="返回 Scripting" action={props.onExit} />
      </VStack>
      <Spacer />
    </VStack>
  );
}

export function ProRequiredPage(props: {
  checking: boolean;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <StartupContent
      systemImage="cylinder.split.1x2.fill"
      iconColor="accentColor"
      title="需要 Scripting Pro"
      description="Itemory 使用 SQLite 在本机保存物品、收支和回顾数据。SQLite 是 Scripting Pro 功能，开通后才能初始化并使用 Itemory。"
      detail="开通后重新运行 Itemory，或点击“重新检查”。"
      checking={props.checking}
      retryTitle="重新检查"
      onRetry={props.onRetry}
      onExit={props.onExit}
    />
  );
}

export function InitializationErrorPage(props: {
  message: string;
  checking: boolean;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <StartupContent
      systemImage="exclamationmark.triangle.fill"
      iconColor="systemOrange"
      title="无法载入数据"
      description="Itemory 未能完成本机数据初始化。现有数据不会被当作空白内容继续打开。"
      detail={props.message}
      checking={props.checking}
      retryTitle="重新初始化"
      onRetry={props.onRetry}
      onExit={props.onExit}
    />
  );
}
