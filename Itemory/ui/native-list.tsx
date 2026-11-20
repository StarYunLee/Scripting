import { UI_METRICS } from "./metrics";
import {
  Button,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  type VStackProps,
} from "scripting";

/**
 * Shared page configuration for a native iOS list.
 *
 * Uses the system inset-grouped style so sections get the standard rounded
 * card background, separators, row insets and section spacing from the host.
 */
export function nativeListPageProps(titleMode: "large" | "inline" = "inline") {
  return {
    navigationBarTitleDisplayMode: titleMode,
    listStyle: "insetGroup" as const,
    listSectionSpacing: UI_METRICS.sectionSpacing,
    listSectionMargins: 0,
    contentMargins: {
      edges: "all" as const,
      insets: {
        top: UI_METRICS.pageTopInset,
        bottom: UI_METRICS.pageBottomInset,
        leading: UI_METRICS.pageHorizontalInset,
        trailing: UI_METRICS.pageHorizontalInset,
      },
      placement: "scrollContent" as const,
    },
  };
}

/**
 * Native section header.
 *
 * The title intentionally keeps the host's section-header text style so pages
 * that use a plain `<Text>` header (for example Settings) and pages that need a
 * trailing detail render at the same size. Only the detail is explicitly styled.
 */
export function NativeSectionHeader(props: { title: string; detail?: string }) {
  return (
    <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity" }}>
      <Text
        font="headline"
        fontWeight="semibold"
        foregroundStyle="secondaryLabel"
        lineLimit={2}
      >
        {props.title}
      </Text>
      <Spacer />
      {props.detail ? (
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
          {props.detail}
        </Text>
      ) : null}
    </HStack>
  );
}

/** Card-level title used when a card needs its own heading inside a section. */
export function NativeCardHeader(props: { title: string; detail?: string }) {
  return (
    <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity" }}>
      <Text font="headline" fontWeight="semibold" lineLimit={1}>
        {props.title}
      </Text>
      <Spacer />
      {props.detail ? (
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
          {props.detail}
        </Text>
      ) : null}
    </HStack>
  );
}

/** Secondary explanatory text used inside list rows. */
export function NativeNoteRow(props: { text: string }) {
  return (
    <Text
      font="footnote"
      foregroundStyle="secondaryLabel"
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      {props.text}
    </Text>
  );
}

/** Native button row: accent icon + title, optionally centered. */
export function NativeActionRow(props: {
  title: string;
  action: () => void | Promise<void>;
  systemImage?: string;
  centered?: boolean;
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
        spacing={props.systemImage ? 10 : 0}
        frame={{
          maxWidth: "infinity",
          alignment: props.centered ? "center" : "leading",
        }}
        contentShape="rect"
      >
        {props.systemImage ? (
          <Image
            systemName={props.systemImage}
            font={17}
            foregroundStyle={
              props.destructive
                ? "systemRed"
                : props.disabled
                  ? "secondaryLabel"
                  : "accentColor"
            }
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

/** Native navigation row: leading icon, title, trailing value and chevron. */
export function NativeNavigationRow(props: {
  title: string;
  action: () => void;
  systemImage?: string;
  detail?: string;
  /** Extra padding for the glass row skin; native rows rely on List row insets. */
  verticalPadding?: number;
}) {
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      action={props.action}
    >
      <HStack
        spacing={12}
        alignment="center"
        frame={{
          minHeight: props.verticalPadding ? 44 : 0,
          maxWidth: "infinity",
        }}
        contentShape="rect"
        padding={
          props.verticalPadding ? { vertical: props.verticalPadding } : undefined
        }
      >
        {props.systemImage ? (
          <Image
            systemName={props.systemImage}
            font={17}
            foregroundStyle="accentColor"
            frame={{ width: 24, alignment: "center" }}
          />
        ) : null}
        <Text lineLimit={1}>{props.title}</Text>
        <Spacer />
        {props.detail ? (
          <Text
            font={UI_METRICS.settingsDetailFont}
            foregroundStyle="secondaryLabel"
            lineLimit={1}
          >
            {props.detail}
          </Text>
        ) : null}
        <Image
          systemName="chevron.right"
          font={13}
          fontWeight="semibold"
          foregroundStyle="tertiaryLabel"
        />
      </HStack>
    </Button>
  );
}

/** Native menu row content with a leading checkmark for the selected option. */
export function NativeMenuChoice(props: {
  title: string;
  selected?: boolean;
  systemImage?: string;
}) {
  return (
    <HStack spacing={8} frame={{ minWidth: 190, alignment: "leading" }}>
      {props.selected ? (
        <Image systemName="checkmark" font={13} frame={{ width: 16 }} />
      ) : (
        <VStack frame={{ width: 16 }} />
      )}
      {props.systemImage ? (
        <Image
          systemName={props.systemImage}
          font={15}
          frame={{ width: 20 }}
        />
      ) : null}
      <Text>{props.title}</Text>
    </HStack>
  );
}

/**
 * Native equivalent of the old GlassGroup: one list row, zero row insets
 * inside the card, and no automatic separators between its children.
 */
export function NativeGroup(props: { children: VStackProps["children"] }) {
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
