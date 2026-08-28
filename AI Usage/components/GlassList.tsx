import type { VStackProps } from "scripting";
import { Divider, Text, VStack } from "scripting";

const CARD_RADIUS = 20;

function GlassRowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: {
          type: "rect",
          cornerRadius: CARD_RADIUS,
          style: "continuous",
        },
      }}
    />
  );
}

export const glassRowBackground = <GlassRowBackground />;

export function GlassGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: "infinity" }}
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
    >
      {props.children}
    </VStack>
  );
}

export function GlassDivider() {
  return <Divider />;
}

export function GlassSectionHeader(props: { title: string }) {
  return <Text foregroundStyle="secondaryLabel">{props.title}</Text>;
}

export function GlassNoteRow(props: { text: string }) {
  return (
    <Text
      font={13}
      foregroundStyle="secondaryLabel"
      padding={{ vertical: true }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      {props.text}
    </Text>
  );
}
