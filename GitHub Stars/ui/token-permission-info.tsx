import { HStack, Text, VStack } from "scripting";

export function TokenPermissionItem(props: {
  title: string;
  scope: string;
  description: string;
}) {
  return (
    <VStack
      alignment="leading"
      spacing={5}
      padding={{ vertical: 12 }}
      frame={{
        minHeight: 72,
        maxWidth: "infinity",
        alignment: "leading",
      }}
    >
      <HStack spacing={4} alignment="center">
        <Text font="subheadline">{props.title}</Text>
        <Text font="subheadline" foregroundStyle="accentColor">
          {`· ${props.scope}`}
        </Text>
      </HStack>
      <Text
        font={13}
        foregroundStyle="secondaryLabel"
        fixedSize={{ horizontal: false, vertical: true }}
      >
        {props.description}
      </Text>
    </VStack>
  );
}
