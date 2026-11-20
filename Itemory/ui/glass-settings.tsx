import {
  Button,
  Divider,
  HStack,
  Image,
  Rectangle,
  Spacer,
  Text,
  VStack,
  type VStackProps,
} from "scripting";

const CARD_RADIUS = 20;

function GlassPageBackground() {
  return (
    <Rectangle
      fill="systemGroupedBackground"
      ignoresSafeArea={true}
      allowsHitTesting={false}
    />
  );
}

/** List props used by the original glass settings layout. */
export function glassSettingsListProps(
  titleMode: "large" | "inline" = "inline",
) {
  return {
    navigationBarTitleDisplayMode: titleMode,
    listStyle: "plain" as const,
    scrollContentBackground: "hidden" as const,
    listRowSeparator: "hidden" as const,
    listRowSpacing: 12,
    listSectionSpacing: 12,
    contentMargins: {
      edges: "horizontal" as const,
      insets: 16,
      placement: "scrollContent" as const,
    },
    background: <GlassPageBackground />,
  };
}

/** One card for a whole Section; rows live inside a single List row. */
export function GlassGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: "infinity" }}
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
      listRowSeparator="hidden"
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

export function GlassNoteRow(props: { text: string }) {
  return (
    <Text
      font={13}
      foregroundStyle="secondaryLabel"
      padding={{ vertical: 8 }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      {props.text}
    </Text>
  );
}

export function GlassRowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      listRowSeparator="hidden"
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

/** Original settings navigation row: 18pt icon, 22pt column, 44pt minimum. */
export function StructureRow(props: {
  title: string;
  detail?: string;
  icon: string;
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
        padding={{ vertical: 8 }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
        alignment="center"
        contentShape="rect"
      >
        <Image
          systemName={props.icon}
          font={18}
          foregroundStyle="accentColor"
          frame={{ width: 22, height: 22 }}
        />
        <Text font="body">{props.title}</Text>
        <Spacer />
        {props.detail ? (
          <Text
            font="subheadline"
            foregroundStyle="secondaryLabel"
            lineLimit={1}
          >
            {props.detail}
          </Text>
        ) : null}
        <Image
          systemName="chevron.right"
          foregroundStyle="tertiaryLabel"
        />
      </HStack>
    </Button>
  );
}

export function GlassActionRow(props: {
  title: string;
  action: () => void | Promise<void>;
  systemImage?: string;
  centered?: boolean;
  natural?: boolean;
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
        spacing={props.systemImage ? 8 : 0}
        padding={props.natural ? { vertical: 12 } : { vertical: true }}
        frame={
          props.natural
            ? {
                maxWidth: "infinity",
                alignment: props.centered ? "center" : "leading",
              }
            : {
                minHeight: 44,
                maxWidth: "infinity",
                alignment: props.centered ? "center" : "leading",
              }
        }
        contentShape="rect"
      >
        {props.systemImage ? (
          <Image
            systemName={props.systemImage}
            foregroundStyle={
              props.destructive
                ? "systemRed"
                : props.disabled
                  ? "secondaryLabel"
                  : "accentColor"
            }
            font={17}
            frame={{ width: 24, alignment: "center" }}
          />
        ) : null}
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
        {props.centered ? null : <Spacer />}
      </HStack>
    </Button>
  );
}
