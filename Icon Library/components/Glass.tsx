import type { VStackProps } from "scripting";
import {
  Button,
  Divider,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
} from "scripting";

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

export function GlassActionRow(props: {
  title: string;
  action: () => void | Promise<void>;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      buttonStyle="plain"
      role={props.destructive ? "destructive" : undefined}
      frame={{ maxWidth: "infinity" }}
      action={props.action}
      disabled={props.disabled}
    >
      <HStack
        padding={{ vertical: true }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
        contentShape="rect"
      >
        <Text
          foregroundStyle={
            props.destructive
              ? "systemRed"
              : props.disabled
                ? "secondaryLabel"
                : "accentColor"
          }
        >
          {props.title}
        </Text>
        <Spacer />
      </HStack>
    </Button>
  );
}

export function GlassNavRow(props: {
  title: string;
  detail?: string;
  action: () => void;
}) {
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      action={props.action}
    >
      <HStack
        padding={{ vertical: true }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
        contentShape="rect"
      >
        <Text>{props.title}</Text>
        <Spacer />
        {props.detail ? (
          <Text foregroundStyle="secondaryLabel">{props.detail}</Text>
        ) : null}
        <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>
  );
}

export function GlassInfoRow(props: {
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <HStack
      padding={{ vertical: true }}
      frame={{ minHeight: 44, maxWidth: "infinity", alignment: "leading" }}
    >
      <VStack
        alignment="leading"
        spacing={6}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        <Text font={13} foregroundStyle="secondaryLabel">
          {props.title}
        </Text>
        <Text font={14} multilineTextAlignment="leading">
          {props.value}
        </Text>
        {props.note ? (
          <Text font={12} foregroundStyle="tertiaryLabel">
            {props.note}
          </Text>
        ) : null}
      </VStack>
    </HStack>
  );
}

export function GlassSelectionRow(props: {
  title: string;
  detail: string;
  selected: boolean;
  action: () => void;
}) {
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      action={props.action}
    >
      <HStack
        spacing={12}
        padding={{ vertical: true }}
        frame={{ minHeight: 56, maxWidth: "infinity" }}
        contentShape="rect"
      >
        <VStack
          alignment="leading"
          spacing={4}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          <Text>{props.title}</Text>
          <Text
            font={13}
            foregroundStyle="secondaryLabel"
            lineLimit={2}
            multilineTextAlignment="leading"
          >
            {props.detail}
          </Text>
        </VStack>
        {props.selected ? (
          <Image
            systemName="checkmark.circle.fill"
            foregroundStyle="accentColor"
          />
        ) : null}
      </HStack>
    </Button>
  );
}

export function GlassLabeledRow(props: {
  title: string;
  value: string;
}) {
  return (
    <HStack
      padding={{ vertical: true }}
      frame={{ minHeight: 44, maxWidth: "infinity" }}
    >
      <Text>{props.title}</Text>
      <Spacer />
      <Text foregroundStyle="secondaryLabel" multilineTextAlignment="trailing">
        {props.value}
      </Text>
    </HStack>
  );
}

export const glassListShell = {
  scrollContentBackground: "hidden" as const,
  listStyle: "plain" as const,
  listRowSpacing: 12,
  listSectionSpacing: 12,
  contentMargins: {
    edges: "horizontal" as const,
    insets: 16,
    placement: "scrollContent" as const,
  },
};
