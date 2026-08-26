import {
  HStack,
  Image,
  Script,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { usageTint } from "../../services/usage-colors";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/cursor/format";
import { PlanBadge } from "./PlanBadge";
import type {
  LimitWindow,
  MediumWidgetLayout,
  UsageResult,
  UsageSnapshot,
} from "../../providers/cursor/types";

type Props = {
  result: UsageResult;
  family: string;
};

const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});

const C: Record<string, Color | DynamicShapeStyle> = {
  bg: "systemBackground",
  primary: "label",
  secondary: "secondaryLabel",
  track: dynamic("#C7C8CC", "#55565C"),
  trackBorder: dynamic("rgba(0,0,0,0.07)", "rgba(255,255,255,0.10)"),
  chip: "label",
  chipText: "systemBackground",
  warn: "systemOrange",
  watermark: dynamic("rgba(35,35,38,0.09)", "rgba(245,245,247,0.075)"),
};

type Model = {
  snapshot: UsageSnapshot | null;
  focus: LimitWindow | null;
  progress: number | null;
  main: string;
  suffix: string;
  fetched: string;
  planLabel: string;
  live: boolean;
  detail: string;
};

function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const focus =
    snapshot?.billingCycle ||
    snapshot?.windows.find((window) => window.name === "billing_cycle") ||
    snapshot?.windows[0] ||
    null;
  const remaining =
    focus?.remainingPercent ??
    (focus?.usedPercent == null ? null : 100 - focus.usedPercent);
  return {
    snapshot,
    focus,
    progress: remaining,
    main: formatPercent(remaining),
    suffix: "剩余",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
  };
}

function isSmall(family: string): boolean {
  const value = family.toLowerCase();
  return value.includes("small") && !value.includes("medium");
}

function Watermark({ size }: { size: number }) {
  return (
    <Image
      filePath={`${Script.directory}/assets/watermark-cursor.png`}
      resizable
      scaleToFit
      renderingMode="template"
      foregroundStyle={C.watermark}
      frame={{ width: size, height: size }}
    />
  );
}

function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize
      ?.width;
    if (width && width > 40) return width;
  } catch {
    /* ignore */
  }
  return isSmall(family) ? 158 : 338;
}

function Progress({
  displayValue,
  usedPercent,
  remainingPercent,
  width,
  height = 5,
}: {
  displayValue: number | null;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
  height?: number;
}) {
  const shown =
    displayValue == null ? null : Math.max(0, Math.min(100, displayValue));
  const fill = shown == null ? 0 : (width * shown) / 100;
  return (
    <ZStack alignment="leading" frame={{ width, height }}>
      <HStack
        frame={{ width, height }}
        background={C.track}
        border={{ style: C.trackBorder, width: 0.5 }}
        clipShape={{ type: "capsule", style: "continuous" }}
      />
      {fill > 0 ? (
        <HStack
          frame={{ width: Math.max(height, fill), height }}
          background={usageTint(usedPercent, remainingPercent)}
          clipShape={{ type: "capsule", style: "continuous" }}
        />
      ) : null}
    </ZStack>
  );
}

function focusTitle(small = false): string {
  return small ? "周期" : "计费周期";
}

export function BillingUsageWidgetView({ result, family }: Props) {
  const model = modelFor(result);
  const small = isSmall(family);
  const pad = small ? 13 : 16;
  const layout: MediumWidgetLayout = {
    left: 20,
    right: 20,
    topY: 10,
    chipFont: 12,
    chipHorizontal: 10,
    chipVertical: 6,
    titleY: 35,
    titleFont: 17,
    mainY: 56,
    mainFont: 40,
    suffixFont: 12,
    progressY: 110,
    progressHeight: 7,
    footerY: 124,
    footerIcon: 10,
    footerLabelFont: 10,
    footerValueFont: 12,
    planY: 9,
    planVertical: 4,
    watermarkSize: 140,
    watermarkRight: -8,
    watermarkBottom: -12,
  };
  const barWidth = Math.max(90, displayWidth(family) - pad * 2);
  const mediumContentWidth = Math.max(
    180,
    displayWidth(family) - layout.left - layout.right,
  );

  if (small)
    return (
      <ZStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        widgetBackground={C.bg}
      >
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomTrailing",
          }}
          padding={{ trailing: -6, bottom: -6 }}
        >
          <Watermark size={96} />
        </HStack>
        <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          <HStack
            alignment="center"
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "topLeading",
            }}
            padding={{ leading: 12, trailing: 12, top: 19 }}
          >
            <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
              {focusTitle(true)}
            </Text>
            <Spacer />
            <PlanBadge label={model.planLabel} small />
          </HStack>

          <HStack
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "topLeading",
            }}
            padding={{ leading: 12, trailing: 12, top: 48 }}
          >
            <VStack spacing={1} alignment="leading">
              <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
                已用
              </Text>
              <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
                {formatPercent(model.focus?.usedPercent)}
              </Text>
            </VStack>
            <Spacer />
            <VStack spacing={1} alignment="trailing">
              <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
                剩余
              </Text>
              <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
                {formatPercent(model.focus?.remainingPercent)}
              </Text>
            </VStack>
          </HStack>

          <HStack
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "topLeading",
            }}
            padding={{ leading: 12, top: 87 }}
          >
            <Progress
              displayValue={model.progress}
              usedPercent={model.focus?.usedPercent}
              remainingPercent={model.focus?.remainingPercent}
              width={barWidth}
              height={7}
            />
          </HStack>

          <VStack
            spacing={3}
            alignment="leading"
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "topLeading",
            }}
            padding={{ leading: 12, trailing: 12, top: 100 }}
          >
            <HStack spacing={4} frame={{ width: barWidth }}>
              <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
                更新时间
              </Text>
              <Spacer />
              <Text font={9} fontWeight="bold" foregroundStyle={C.primary}>
                {formatSmallDate(model.snapshot?.fetchedAt)}
              </Text>
            </HStack>
            <HStack spacing={4} frame={{ width: barWidth }}>
              <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
                重置时间
              </Text>
              <Spacer />
              <Text font={9} fontWeight="bold" foregroundStyle={C.primary}>
                {formatSmallDate(model.focus?.resetAt)}
              </Text>
            </HStack>
          </VStack>

          {!model.live && model.detail ? (
            <HStack
              frame={{
                maxWidth: "infinity",
                maxHeight: "infinity",
                alignment: "bottomLeading",
              }}
              padding={{ horizontal: 12, bottom: 2 }}
            >
              <Text font={7} foregroundStyle={C.warn} lineLimit={1}>
                {model.detail}
              </Text>
            </HStack>
          ) : null}
        </ZStack>
      </ZStack>
    );

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "bottomTrailing",
        }}
        padding={{
          trailing: layout.watermarkRight + 1,
          bottom: layout.watermarkBottom + 1,
        }}
      >
        <Watermark size={layout.watermarkSize} />
      </HStack>
      <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <HStack
          spacing={6}
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: layout.left, top: layout.planY }}
        >
          <PlanBadge label={model.planLabel} />
        </HStack>

        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topTrailing",
          }}
          padding={{ trailing: layout.right, top: layout.topY }}
        >
          <HStack
            padding={{
              horizontal: layout.chipHorizontal,
              vertical: layout.chipVertical,
            }}
            background={C.chip}
            clipShape={{ type: "capsule", style: "continuous" }}
          >
            <Text
              font={layout.chipFont}
              fontWeight="semibold"
              foregroundStyle={C.chipText}
            >
              {`已用 ${formatPercent(model.focus?.usedPercent)}`}
            </Text>
          </HStack>
        </HStack>

        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{
            leading: layout.left,
            trailing: layout.right,
            top: layout.titleY,
          }}
        >
          <Text font={layout.titleFont} fontWeight="bold" foregroundStyle={C.primary}>
            {focusTitle()}
          </Text>
          <Spacer />
        </HStack>

        <HStack
          alignment="lastTextBaseline"
          spacing={7}
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{
            leading: layout.left,
            trailing: layout.right,
            top: layout.mainY,
          }}
        >
          <Text
            font={layout.mainFont}
            fontWeight="bold"
            foregroundStyle={C.primary}
            minScaleFactor={0.4}
          >
            {model.main}
          </Text>
          <Text
            font={layout.suffixFont}
            fontWeight="medium"
            foregroundStyle={C.secondary}
          >
            {model.suffix}
          </Text>
          <Spacer />
        </HStack>

        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: layout.left, top: layout.progressY }}
        >
          <Progress
            displayValue={model.progress}
            usedPercent={model.focus?.usedPercent}
            remainingPercent={model.focus?.remainingPercent}
            width={mediumContentWidth}
            height={layout.progressHeight}
          />
        </HStack>

        <HStack
          spacing={8}
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{
            leading: layout.left,
            trailing: layout.right,
            top: layout.footerY + 2,
          }}
        >
          <VStack spacing={1} alignment="leading" frame={{ width: mediumContentWidth / 2 }}>
            <Text font={layout.footerLabelFont} foregroundStyle={C.secondary}>
              更新时间
            </Text>
            <Text font={layout.footerValueFont} fontWeight="bold" foregroundStyle={C.primary}>
              {model.fetched}
            </Text>
          </VStack>
          <VStack spacing={1} alignment="trailing" frame={{ width: mediumContentWidth / 2 }}>
            <Text font={layout.footerLabelFont} foregroundStyle={C.secondary}>
              重置时间
            </Text>
            <Text font={layout.footerValueFont} fontWeight="bold" foregroundStyle={C.primary}>
              {formatResetDate(model.focus?.resetAt)}
            </Text>
          </VStack>
        </HStack>

        {!model.live && model.detail ? (
          <HStack
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "bottomLeading",
            }}
            padding={{ horizontal: 16, bottom: 3 }}
          >
            <Text font={9} foregroundStyle={C.warn} lineLimit={1}>
              {model.detail}
            </Text>
          </HStack>
        ) : null}
      </ZStack>
    </ZStack>
  );
}
