import { Text, VStack } from "scripting";

export function EmptyState(props: { title: string; detail?: string }) {
  return (
    <VStack
      spacing={6}
      padding={{ vertical: 26 }}
      frame={{ maxWidth: "infinity" }}
      listRowSeparator="hidden"
    >
      <Text font="headline">{props.title}</Text>
      {props.detail ? (
        <Text foregroundStyle="secondaryLabel">{props.detail}</Text>
      ) : null}
    </VStack>
  );
}
