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

export function GlassSectionHeader(props: { title: string; detail?: string }) {
  return (
    <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
      <Text foregroundStyle="secondaryLabel">{props.title}</Text>
      <Spacer />
      {props.detail ? (
        <Text
          foregroundStyle="secondaryLabel"
          lineLimit={1}
          multilineTextAlignment="trailing"
        >
          {props.detail}
        </Text>
      ) : null}
    </HStack>
  );
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
  detailFont?: "system" | "subheadline";
  action: () => void;
  onMenu?: () => void;
  showDivider?: boolean;
}) {
  return (
    <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
      <HStack spacing={0} frame={{ maxWidth: "infinity" }}>
        <Button
          buttonStyle="plain"
          frame={{ maxWidth: "infinity" }}
          action={props.action}
        >
          {props.onMenu ? (
            <VStack
              spacing={4}
              alignment="leading"
              padding={{ vertical: 10 }}
              frame={{ minHeight: 56, maxWidth: "infinity" }}
              contentShape="rect"
            >
              <Text
                lineLimit={2}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                {props.title}
              </Text>
              {props.detail ? (
                <Text
                  font="subheadline"
                  foregroundStyle="secondaryLabel"
                  lineLimit={1}
                >
                  {props.detail}
                </Text>
              ) : null}
            </VStack>
          ) : (
            <HStack
              spacing={10}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
              contentShape="rect"
            >
              <Text
                lineLimit={2}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                {props.title}
              </Text>
              {props.detail ? (
                props.detailFont === "system" ? (
                  <Text
                    foregroundStyle="secondaryLabel"
                    multilineTextAlignment="trailing"
                    lineLimit={1}
                  >
                    {props.detail}
                  </Text>
                ) : (
                  <Text
                    font="subheadline"
                    foregroundStyle="secondaryLabel"
                    multilineTextAlignment="trailing"
                    lineLimit={1}
                  >
                    {props.detail}
                  </Text>
                )
              ) : null}
              <Image
                systemName="chevron.right"
                foregroundStyle="tertiaryLabel"
              />
            </HStack>
          )}
        </Button>
        {props.onMenu ? (
          <Button
            title=""
            systemImage="ellipsis"
            buttonStyle="plain"
            frame={{ width: 44, height: 56 }}
            foregroundStyle="secondaryLabel"
            contentShape="rect"
            action={props.onMenu}
          />
        ) : null}
      </HStack>
      {props.showDivider ? <GlassDivider /> : null}
    </VStack>
  );
}

export function GlassLabeledRow(props: { title: string; value: string }) {
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
