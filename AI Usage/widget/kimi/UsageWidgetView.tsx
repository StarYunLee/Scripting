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
} from "../../providers/kimi/format";
import { PlanBadge } from "./PlanBadge";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/kimi/types";

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
  warn: "systemOrange",
  watermark: dynamic("rgba(35,35,38,0.09)", "rgba(245,245,247,0.075)"),
};

type Model = {
  snapshot: UsageSnapshot | null;
  windows: LimitWindow[];
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};

function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const windows: LimitWindow[] = [];
  if (snapshot) {
    if (snapshot.fiveHour) windows.push(snapshot.fiveHour);
    if (snapshot.weekly) windows.push(snapshot.weekly);
    for (const window of snapshot.windows) {
      if (!windows.some((item) => item.id === window.id)) windows.push(window);
    }
  }
  return {
    snapshot,
    windows: windows.slice(0, 2),
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
  };
}

function isSmall(family: string): boolean {
  const value = family.toLowerCase();
  return value.includes("small") && !value.includes("medium");
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

function Watermark({ size }: { size: number }) {
  return (
    <Image
      filePath={`${Script.directory}/assets/watermark-kimi.png`}
      resizable
      scaleToFit
      renderingMode="template"
      foregroundStyle={C.watermark}
      frame={{ width: size, height: size }}
    />
  );
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

function WindowRow({
  window,
  width,
  compact,
}: {
  window: LimitWindow;
  width: number;
  compact: boolean;
}) {
  return (
    <VStack spacing={compact ? 2 : 3} alignment="leading" frame={{ width }}>
      <HStack frame={{ width }}>
        <Text
          font={compact ? 11 : 13}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
        >
          {window.label}
        </Text>
        <Spacer />
        <Text
          font={compact ? 11 : 13}
          fontWeight="bold"
          foregroundStyle={C.primary}
          monospacedDigit
        >
          {`剩余 ${formatPercent(window.remainingPercent)}`}
        </Text>
      </HStack>
      <Progress
        displayValue={window.remainingPercent}
        usedPercent={window.usedPercent}
        remainingPercent={window.remainingPercent}
        width={width}
        height={compact ? 5 : 6}
      />
      <HStack frame={{ width }}>
        <Text font={compact ? 9 : 10} foregroundStyle={C.secondary}>
          重置 {compact ? formatSmallDate(window.resetAt) : formatResetDate(window.resetAt)}
        </Text>
      </HStack>
    </VStack>
  );
}

export function UsageWidgetView({ result, family }: Props) {
  const model = modelFor(result);
  const small = isSmall(family);
  const pad = small ? 12 : 16;
  const contentWidth = Math.max(90, displayWidth(family) - pad * 2);

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
        padding={{ trailing: small ? -6 : -8, bottom: small ? -6 : -10 }}
      >
        <Watermark size={small ? 88 : 130} />
      </HStack>
      <VStack
        spacing={small ? 8 : 10}
        alignment="leading"
        padding={pad}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
      >
        <HStack frame={{ width: contentWidth }}>
          <PlanBadge label={model.planLabel} small={small} />
          <Spacer />
          <Text font={small ? 9 : 11} foregroundStyle={C.secondary}>
            {small ? formatSmallDate(model.snapshot?.fetchedAt) : `更新 ${model.fetched}`}
          </Text>
        </HStack>
        {model.windows.length === 0 ? (
          <Text font={12} foregroundStyle={C.secondary}>
            暂无用量窗口
          </Text>
        ) : (
          model.windows.map((window) => (
            <WindowRow
              key={window.id}
              window={window}
              width={contentWidth}
              compact={small}
            />
          ))
        )}
        {!model.live && model.detail ? (
          <Text font={small ? 7 : 9} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        ) : null}
      </VStack>
    </ZStack>
  );
}
