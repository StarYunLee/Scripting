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
  warn: "systemOrange",
  watermark: dynamic("rgba(35,35,38,0.09)", "rgba(245,245,247,0.075)"),
};

type Model = {
  snapshot: UsageSnapshot | null;
  windows: LimitWindow[];
  planLabel: string;
  fetched: string;
  resetAt: string | null;
  live: boolean;
  detail: string;
};

function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const preferred = [
    "auto",
    "total",
    "api",
    "grok_bot",
    "plan",
    "weekly",
  ] as const;
  const windows: LimitWindow[] = [];
  if (snapshot) {
    for (const name of preferred) {
      const found =
        (name === "auto" && snapshot.auto) ||
        (name === "total" && snapshot.total) ||
        (name === "api" && snapshot.api) ||
        (name === "grok_bot" && snapshot.grokBot) ||
        (name === "plan" && snapshot.plan) ||
        (name === "weekly" && snapshot.weekly) ||
        snapshot.windows.find((window) => window.name === name) ||
        null;
      if (found && !windows.some((item) => item.id === found.id))
        windows.push(found);
    }
    for (const window of snapshot.windows) {
      if (!windows.some((item) => item.id === window.id)) windows.push(window);
    }
  }
  return {
    snapshot,
    windows,
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    resetAt: windows[0]?.resetAt || null,
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

function WindowRow({
  window,
  width,
  compact,
}: {
  window: LimitWindow;
  width: number;
  compact: boolean;
}) {
  const remaining = window.remainingPercent;
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
          {`剩余 ${formatPercent(remaining)}`}
        </Text>
      </HStack>
      <Progress
        displayValue={remaining}
        usedPercent={window.usedPercent}
        remainingPercent={window.remainingPercent}
        width={width}
        height={compact ? 5 : 6}
      />
    </VStack>
  );
}

export function BillingUsageWidgetView({ result, family }: Props) {
  const model = modelFor(result);
  const small = isSmall(family);
  const pad = small ? 12 : 16;
  const contentWidth = Math.max(90, displayWidth(family) - pad * 2);
  const rows = model.windows.slice(0, 4);
  const tight = small && rows.length >= 4;

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
        spacing={tight ? 5 : small ? 8 : 10}
        alignment="leading"
        padding={pad}
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      >
        <HStack frame={{ width: contentWidth }}>
          <PlanBadge label={model.planLabel} small={small} />
          <Spacer />
          <Text
            font={small ? 9 : 11}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            {small
              ? formatSmallDate(model.resetAt)
              : `重置 ${formatResetDate(model.resetAt)}`}
          </Text>
        </HStack>

        {rows.length === 0 ? (
          <Text font={12} foregroundStyle={C.secondary}>
            暂无用量窗口
          </Text>
        ) : (
          rows.map((window) => (
            <WindowRow
              key={window.id}
              window={window}
              width={contentWidth}
              compact={small || tight}
            />
          ))
        )}

        {!small ? (
          <HStack frame={{ width: contentWidth }}>
            <Text font={10} foregroundStyle={C.secondary}>
              更新 {model.fetched}
            </Text>
            <Spacer />
            {!model.live && model.detail ? (
              <Text font={9} foregroundStyle={C.warn} lineLimit={1}>
                {model.detail}
              </Text>
            ) : null}
          </HStack>
        ) : !model.live && model.detail ? (
          <Text font={7} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        ) : null}
      </VStack>
    </ZStack>
  );
}
