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
import { CLAUDE_WIDGET } from "../../copy/labels";
import { usageTint } from "../../services/usage-colors";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
  resetCreditsSummary,
} from "../../providers/grok/format";
import { PlanBadge } from "./PlanBadge";
import type {
  LimitWindow,
  MediumWidgetLayout,
  UsageResult,
  UsageSnapshot,
} from "../../providers/grok/types";

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
  // 轨道使用独立中性灰：比 Logo 深、比主进度浅，穿过水印时仍能辨认。
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
  resetLabel: string;
  resetExpiration: string;
  resetExpirationAt: string | null;
  live: boolean;
  detail: string;
};
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const focus =
    snapshot?.weekly ||
    snapshot?.windows.find((window) => window.name === "weekly") ||
    null;
  const remaining =
    focus?.remainingPercent ??
    (focus?.usedPercent == null ? null : 100 - focus.usedPercent);
  const resets = resetCreditsSummary(
    snapshot?.resetCreditsAvailable,
    snapshot?.resetCreditExpirations,
  );
  return {
    snapshot,
    focus,
    progress: remaining,
    main: formatPercent(remaining),
    suffix: "剩余",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    resetLabel:
      resets.available == null ? "重置 —" : `重置 ${resets.available} 次`,
    resetExpiration: formatResetDate(resets.nearestExpiration),
    resetExpirationAt: resets.nearestExpiration,
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
      filePath={`${Script.directory}/assets/watermark-grok.png`}
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
function SmallInfoRow({
  icon,
  label,
  value,
  width,
}: {
  icon: string;
  label: string;
  value: string;
  width: number;
}) {
  const valueWidth = 76;
  return (
    <HStack spacing={4} frame={{ width }}>
      <Image
        systemName={icon}
        resizable
        scaleToFit
        imageScale="small"
        foregroundStyle={C.secondary}
        frame={{ width: 8, height: 8 }}
      />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={9}
        fontWeight="bold"
        foregroundStyle={C.secondary}
        lineLimit={1}
      >
        {label}
      </Text>
      <Spacer minLength={0} />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={9}
        fontWeight="bold"
        foregroundStyle={C.primary}
        monospacedDigit
        lineLimit={1}
        minScaleFactor={0.65}
        frame={{
          width: valueWidth,
          alignment: value === "—" ? "center" : "leading",
        }}
      >
        {value}
      </Text>
    </HStack>
  );
}
type MetaAlignment = "leading" | "center" | "trailing";
function MetaColumn({
  icon,
  label,
  value,
  width,
  layout,
  alignment,
}: {
  icon: string;
  label: string;
  value: string;
  width: number;
  layout: MediumWidgetLayout;
  alignment: MetaAlignment;
}) {
  const stackAlignment = alignment === "center" ? "center" : alignment;
  const rowAlignment =
    alignment === "center"
      ? "center"
      : alignment === "trailing"
        ? "trailing"
        : "leading";
  return (
    <VStack spacing={1} alignment={stackAlignment} frame={{ width }}>
      <HStack spacing={3} frame={{ width, alignment: rowAlignment }}>
        <Image
          systemName={icon}
          resizable
          scaleToFit
          imageScale="small"
          foregroundStyle={C.secondary}
          frame={{ width: layout.footerIcon, height: layout.footerIcon }}
        />
        <Text
          fontDesign="default"
          fontWidth="standard"
          font={layout.footerLabelFont}
          fontWeight="medium"
          foregroundStyle={C.secondary}
        >
          {label}
        </Text>
      </HStack>
      <HStack frame={{ width, alignment: rowAlignment }}>
        <Text
          fontDesign="default"
          fontWidth="standard"
          font={layout.footerValueFont}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {value}
        </Text>
      </HStack>
    </VStack>
  );
}
function focusTitle(small = false): string {
  return small ? CLAUDE_WIDGET.shortWeekly : CLAUDE_WIDGET.weeklyQuota;
}

export function WeeklyUsageWidgetView({ result, family }: Props) {
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
  const metaGap = 8;
  const metaColumnWidth = Math.max(58, (mediumContentWidth - metaGap * 2) / 3);
  const balancedFooterY = layout.footerY + 2;

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
            <Text
              fontDesign="default"
              fontWidth="standard"
              font={16}
              fontWeight="bold"
              foregroundStyle={C.primary}
            >
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
              <Text
                fontDesign="default"
                fontWidth="standard"
                font={9}
                fontWeight="bold"
                foregroundStyle={C.secondary}
              >
                已用
              </Text>
              <Text
                fontDesign="default"
                fontWidth="standard"
                font={16}
                fontWeight="bold"
                foregroundStyle={C.primary}
              >
                {formatPercent(model.focus?.usedPercent)}
              </Text>
            </VStack>
            <Spacer />
            <VStack spacing={1} alignment="trailing">
              <Text
                fontDesign="default"
                fontWidth="standard"
                font={9}
                fontWeight="bold"
                foregroundStyle={C.secondary}
              >
                剩余
              </Text>
              <Text
                fontDesign="default"
                fontWidth="standard"
                font={16}
                fontWeight="bold"
                foregroundStyle={C.primary}
              >
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
            <SmallInfoRow
              icon="clock"
              label="更新时间"
              value={formatSmallDate(model.snapshot?.fetchedAt)}
              width={barWidth}
            />
            <SmallInfoRow
              icon="calendar"
              label="重置时间"
              value={formatSmallDate(model.focus?.resetAt)}
              width={barWidth}
            />
            <SmallInfoRow
              icon="arrow.clockwise"
              label={model.resetLabel}
              value={formatSmallDate(model.resetExpirationAt)}
              width={barWidth}
            />
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
              <Text
                fontDesign="default"
                fontWidth="standard"
                font={7}
                foregroundStyle={C.warn}
                lineLimit={1}
              >
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
              fontDesign="default"
              fontWidth="standard"
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
          <Text
            fontDesign="default"
            fontWidth="standard"
            font={layout.titleFont}
            fontWeight="bold"
            foregroundStyle={C.primary}
          >
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
            fontDesign="default"
            fontWidth="standard"
            font={layout.mainFont}
            fontWeight="bold"
            foregroundStyle={C.primary}
            minScaleFactor={0.4}
          >
            {model.main}
          </Text>
          <Text
            fontDesign="default"
            fontWidth="standard"
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
          spacing={metaGap}
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{
            leading: layout.left,
            trailing: layout.right,
            top: balancedFooterY,
          }}
        >
          <MetaColumn
            icon="clock"
            label="更新时间"
            value={model.fetched}
            width={metaColumnWidth}
            layout={layout}
            alignment="leading"
          />
          <MetaColumn
            icon="arrow.clockwise"
            label={model.resetLabel}
            value={model.resetExpiration}
            width={metaColumnWidth}
            layout={layout}
            alignment="center"
          />
          <MetaColumn
            icon="calendar"
            label="重置时间"
            value={formatResetDate(model.focus?.resetAt)}
            width={metaColumnWidth}
            layout={layout}
            alignment="trailing"
          />
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
            <Text
              fontDesign="default"
              fontWidth="standard"
              font={9}
              foregroundStyle={C.warn}
              lineLimit={1}
            >
              {model.detail}
            </Text>
          </HStack>
        ) : null}
      </ZStack>
    </ZStack>
  );
}
