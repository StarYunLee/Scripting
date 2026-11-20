import {
  Divider,
  Rectangle,
  Section,
  VStack,
  type CommonViewProps,
  type SectionProps,
  type VirtualNode,
} from "scripting";
import { UI_METRICS } from "./metrics";
import { nativeListPageProps } from "./native-list";
import type { UiTheme } from "./theme";

/**
 * Theme-owned props for the native `List`. Pages keep `<List>` as a direct
 * child of `NavigationStack` and only spread these props.
 */
export function appListProps(
  theme: UiTheme,
  titleMode: "large" | "inline" = "inline",
) {
  if (theme === "native") return nativeListPageProps(titleMode);

  return {
    navigationBarTitleDisplayMode: titleMode,
    listStyle: "plain" as const,
    scrollContentBackground: "hidden" as const,
    listSectionSpacing: UI_METRICS.sectionSpacing,
    listSectionMargins: 0,
    background: <GlassPageBackground />,
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

type AppSectionProps = Omit<CommonViewProps, "children"> &
  SectionProps & {
    theme: UiTheme;
    surface?: "card" | "none";
    glassRadius?: number;
    groupRows?: boolean;
  };

/**
 * Section shell. Native returns the Section untouched. Glass renders the
 * Section as one card and groups all rows into a single List row, so rows do
 * not each get their own glass background.
 */
export function AppSection(props: AppSectionProps) {
  const {
    theme,
    surface = "card",
    glassRadius = 20,
    groupRows = true,
    children,
    ...rest
  } = props;

  if (theme !== "glass" || surface === "none") {
    return <Section {...rest}>{children}</Section>;
  }

  return (
    <Section
      {...rest}
      listRowBackground={<Rectangle fill="clear" />}
      listRowSeparator="hidden"
    >
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity" }}
        listRowInsets={0}
        listRowSeparator="hidden"
      >
        <VStack
          spacing={0}
          frame={{ maxWidth: "infinity" }}
          padding={{ horizontal: 16 }}
          glassEffect={{
            glass: UIGlass.regular(),
            shape: {
              type: "rect",
              cornerRadius: glassRadius,
              style: "continuous",
            },
          }}
        >
          {groupRows ? glassRows(children) : children}
        </VStack>
      </VStack>
    </Section>
  );
}

function glassRows(children: AppSectionProps["children"]): VirtualNode[] {
  const items = (Array.isArray(children) ? children : [children]).filter(
    (child): child is VirtualNode =>
      child !== null && child !== undefined && child !== false,
  );

  return items.map((child, index) => (
    <VStack
      key={index}
      spacing={0}
      frame={{ minHeight: 44, maxWidth: "infinity" }}
      padding={{ vertical: 8 }}
    >
      {child}
      {index < items.length - 1 ? <Divider /> : null}
    </VStack>
  ));
}

function GlassPageBackground() {
  return (
    <Rectangle
      fill="systemGroupedBackground"
      ignoresSafeArea={true}
      allowsHitTesting={false}
    />
  );
}


/** Surface props for the review timeline card; layout stays on the HStack. */
export function appReviewCardProps(theme: UiTheme, radius?: number) {
  const resolvedRadius = radius ?? UI_METRICS.reviewCardRadius;
  if (theme === "glass") {
    return {
      glassEffect: {
        glass: UIGlass.regular(),
        shape: {
          type: "rect" as const,
          cornerRadius: resolvedRadius,
          style: "continuous" as const,
        },
      },
    };
  }
  return {
    background: "secondarySystemGroupedBackground" as const,
    clipShape: {
      type: "rect" as const,
      cornerRadius: resolvedRadius,
      style: "continuous" as const,
    },
  };
}

/** Native needs a 12pt first-row inset to clear the insetGroup corner. */
export function appReviewTopInset(theme: UiTheme): number {
  return theme === "native" ? UI_METRICS.reviewSectionCornerClearance : 0;
}

/** Glass rows have no List row insets, so the row itself supplies padding. */
export function appNavigationRowPadding(_theme: UiTheme): number {
  // The glass Section now owns row padding; rows must not add it twice.
  return 0;
}

/** Top content inset for the review page, paired with appReviewTopInset. */
export function appReviewPageTopInset(theme: UiTheme): number {
  return theme === "native" ? 0 : UI_METRICS.pageTopInset;
}
