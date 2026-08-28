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
import type { ProviderId } from "../../models";
import { PlanBadge } from "../../components/PlanBadge";
import { usageTint } from "../../services/usage-colors";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/cursor/format";
import {
  providerResetLine,
  providerWidgetWindowRows,
} from "./provider-windows";
import type { ProviderSnapshotInput } from "./provider-windows";
import {
  remainingPercent,
  selectWidgetWindows,
  widgetMultiLayout,
  widgetPresentation,
} from "./window-model";
import type { WidgetWindow } from "./window-model";

export type SharedUsageResult = {
  ok: boolean;
  snapshot?: ProviderSnapshotInput;
  error?: { message: string };
  cache?: ProviderSnapshotInput | null;
};

type Props = {
  provider: ProviderId;
  result: SharedUsageResult;
  family: string;
  hiddenWindowIds: string[];
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
  watermark: dynamic("rgba(35,35,38,0.065)", "rgba(245,245,247,0.06)"),
};

const EMPTY_NO_WINDOW = "暂无用量窗口";
const EMPTY_ALL_HIDDEN = "未选择用量窗口";

const WATERMARK_FILE: Record<ProviderId, string> = {
  codex: "watermark-chatgpt.png",
  grok: "watermark-grok.png",
  claude: "watermark-claude.png",
  antigravity: "watermark-antigravity.png",
  cursor: "watermark-cursor.png",
  kimi: "watermark-kimi.png",
  copilot: "watermark-copilot.png",
  zai: "watermark-zai.png",
  minimax: "watermark-minimax.png",
};

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

function Watermark({ provider, size }: { provider: ProviderId; size: number }) {
  return (
    <Image
      filePath={`${Script.directory}/assets/${WATERMARK_FILE[provider]}`}
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

type Model = {
  snapshot: ProviderSnapshotInput | null;
  rows: WidgetWindow[];
  resetLine: { available: number | null; nearestExpiration: string | null } | null;
  planLabel: string;
  live: boolean;
  detail: string;
};

function modelFor(provider: ProviderId, result: SharedUsageResult, hiddenWindowIds: string[]): Model {
  const snapshot = result.ok
    ? (result.snapshot as ProviderSnapshotInput)
    : (result.cache as ProviderSnapshotInput | null | undefined) || null;
  const rows = selectWidgetWindows(
    providerWidgetWindowRows(provider, snapshot),
    hiddenWindowIds,
  );
  return {
    snapshot,
    rows,
    resetLine: providerResetLine(provider, snapshot),
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    live: Boolean(result.ok),
    detail: result.ok ? "" : result.error?.message || "",
  };
}

/** 行数值：Small 双/多行只留裸百分比，Medium 保留“剩余”。 */
function ValueText({
  remaining,
  small,
  font,
}: {
  remaining: number | null;
  small: boolean;
  font: number;
}) {
  return (
    <HStack alignment="center" spacing={small ? 0 : 2}>
      <Text
        font={font}
        fontWeight="bold"
        foregroundStyle={C.primary}
        monospacedDigit
        lineLimit={1}
      >
        {formatPercent(remaining)}
      </Text>
      {!small ? (
        <Text font={font - 1} foregroundStyle={C.secondary}>
          剩余
        </Text>
      ) : null}
    </HStack>
  );
}

function ResetCreditsChip({
  model,
  small,
}: {
  model: Model;
  small: boolean;
}) {
  if (!model.resetLine) return null;
  const label = `权益 ${model.resetLine.available ?? 0} 次`;
  return (
    <Text
      font={small ? 9 : 10}
      foregroundStyle={C.secondary}
      lineLimit={1}
      minScaleFactor={small ? 0.75 : 0.8}
    >
      {small
        ? label
        : `${label} · ${formatResetDate(model.resetLine.nearestExpiration)}`}
    </Text>
  );
}

function Header({
  model,
  provider,
  small,
  width,
}: {
  model: Model;
  provider: ProviderId;
  small: boolean;
  width: number;
}) {
  return (
    <HStack frame={{ width }}>
      <PlanBadge
        provider={provider}
        label={model.planLabel}
        size={small ? "small" : "regular"}
      />
      <Spacer minLength={0} />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={small ? 8 : 9}
        fontWeight="medium"
        foregroundStyle={C.secondary}
        lineLimit={1}
        minScaleFactor={0.75}
      >
        {small
          ? formatSmallDate(model.snapshot?.fetchedAt)
          : `更新 ${formatResetDate(model.snapshot?.fetchedAt)}`}
      </Text>
    </HStack>
  );
}

function usedOf(window: WidgetWindow): number | null {
  if (window.usedPercent != null) return window.usedPercent;
  const remaining = remainingPercent(
    window.remainingPercent,
    window.usedPercent,
  );
  return remaining == null ? null : 100 - remaining;
}

function SingleWindowView({
  model,
  provider,
  window,
  family,
}: {
  model: Model;
  provider: ProviderId;
  window: WidgetWindow;
  family: string;
}) {
  const small = isSmall(family);
  const width = displayWidth(family);
  const pad = small ? 12 : 20;
  const contentWidth = Math.max(90, width - pad * 2);
  const remaining = remainingPercent(
    window.remainingPercent,
    window.usedPercent,
  );
  const used = usedOf(window);
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }}
        padding={{ trailing: small ? -6 : -8, bottom: small ? -6 : -10 }}
      >
        <Watermark provider={provider} size={small ? 96 : 140} />
      </HStack>
      <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <HStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
          padding={{ leading: pad, trailing: pad, top: small ? 18 : 9 }}
        >
          <Header model={model} provider={provider} small={small} width={contentWidth} />
        </HStack>
        <HStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
          padding={{ leading: pad, trailing: pad, top: small ? 48 : 39 }}
        >
          <Text
            font={small ? 16 : 17}
            fontWeight="bold"
            foregroundStyle={C.primary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {window.label}
          </Text>
        </HStack>
        <HStack
          alignment="lastTextBaseline"
          spacing={4}
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
          padding={{ leading: pad, trailing: pad, top: small ? 68 : 56 }}
        >
          {/* 两个尺寸都是两个带标签的组，顺序固定：已用 X% → 剩余 Y%。 */}
          <Text
            font={small ? 15 : 20}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            monospacedDigit
            lineLimit={1}
            minScaleFactor={small ? 0.65 : 0.8}
          >
            {`已用 ${formatPercent(used)}`}
          </Text>
          <Spacer minLength={4} />
          <Text
            font={small ? 22 : 28}
            fontWeight="bold"
            foregroundStyle={C.primary}
            monospacedDigit
            lineLimit={1}
            minScaleFactor={small ? 0.65 : 0.8}
          >
            {`剩余 ${formatPercent(remaining)}`}
          </Text>
        </HStack>
        <HStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
          padding={{ leading: pad, top: small ? 108 : 110 }}
        >
          <Progress
            displayValue={remaining}
            usedPercent={window.usedPercent}
            remainingPercent={window.remainingPercent}
            width={contentWidth}
            height={7}
          />
        </HStack>
        <HStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
          padding={{ leading: pad, trailing: pad, top: small ? 121 : 124 }}
        >
          <Text font={small ? 9 : 10} foregroundStyle={C.secondary} lineLimit={1}>
            {`重置 ${formatResetDate(window.resetAt)}`}
          </Text>
          <Spacer minLength={4} />
          <ResetCreditsChip model={model} small={small} />
        </HStack>
        {!model.live && model.detail ? (
          <HStack
            frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }}
            padding={{ horizontal: pad, bottom: 2 }}
          >
            <Text font={small ? 7 : 8} foregroundStyle={C.warn} lineLimit={1}>
              {model.detail}
            </Text>
          </HStack>
        ) : null}
      </ZStack>
    </ZStack>
  );
}

function DualWindow({
  window,
  width,
  small,
  top,
  resetSupplement,
}: {
  window: WidgetWindow;
  width: number;
  small: boolean;
  top: number;
  resetSupplement?: string | null;
}) {
  const remaining = remainingPercent(
    window.remainingPercent,
    window.usedPercent,
  );
  const leading = small ? 12 : 20;
  return (
    <>
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
        padding={{ leading, trailing: leading, top }}
      >
        <Text
          font={small ? 12 : 15}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {window.label}
        </Text>
        <Spacer minLength={4} />
        <ValueText remaining={remaining} small={small} font={small ? 11 : 14} />
      </HStack>
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
        padding={{ leading, top: top + (small ? 20 : 24) }}
      >
        <Progress
          displayValue={remaining}
          usedPercent={window.usedPercent}
          remainingPercent={window.remainingPercent}
          width={width}
          height={small ? 5 : 7}
        />
      </HStack>
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
        padding={{ leading, trailing: leading, top: top + (small ? 30 : 36) }}
      >
        <Text
          font={small ? 9 : 10}
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {`重置 ${formatResetDate(window.resetAt)}${
            resetSupplement ? ` · ${resetSupplement}` : ""
          }`}
        </Text>
      </HStack>
    </>
  );
}

function DualWindowView({
  model,
  provider,
  rows,
  family,
}: {
  model: Model;
  provider: ProviderId;
  rows: WidgetWindow[];
  family: string;
}) {
  const small = isSmall(family);
  const width = displayWidth(family);
  const contentWidth = Math.max(small ? 112 : 220, width - (small ? 24 : 40));
  const resetCredits = model.resetLine
    ? `权益 ${model.resetLine.available ?? 0} 次`
    : null;
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }}
        padding={{ trailing: small ? -9 : -11, bottom: small ? -9 : -13 }}
      >
        <Watermark provider={provider} size={small ? 100 : 145} />
      </HStack>
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
        padding={{ leading: small ? 12 : 20, trailing: small ? 12 : 20, top: small ? 18 : 9 }}
      >
        <Header model={model} provider={provider} small={small} width={contentWidth} />
      </HStack>
      <DualWindow
        window={rows[0]}
        width={contentWidth}
        small={small}
        top={small ? 43 : 38}
      />
      <DualWindow
        window={rows[1]}
        width={contentWidth}
        small={small}
        top={small ? 99 : 96}
        resetSupplement={resetCredits}
      />
      {!model.live && model.detail ? (
        <HStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }}
          padding={{ horizontal: small ? 12 : 20, bottom: 2 }}
        >
          <Text font={small ? 7 : 8} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}

function MultiWindowView({
  model,
  provider,
  rows,
  family,
}: {
  model: Model;
  provider: ProviderId;
  rows: WidgetWindow[];
  family: string;
}) {
  const small = isSmall(family);
  const pad = small ? 12 : 16;
  const contentWidth = Math.max(90, displayWidth(family) - pad * 2);
  const layout = widgetMultiLayout(family, rows.length);
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }}
        padding={{ trailing: small ? -6 : -8, bottom: small ? -6 : -10 }}
      >
        <Watermark provider={provider} size={small ? 96 : 140} />
      </HStack>
      <VStack
        spacing={layout.contentSpacing}
        alignment="leading"
        padding={pad}
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      >
        <Header model={model} provider={provider} small={small} width={contentWidth} />
        {rows.map((window) => {
          const remaining = remainingPercent(
            window.remainingPercent,
            window.usedPercent,
          );
          return (
            <VStack
              key={window.id}
              spacing={layout.rowSpacing}
              alignment="leading"
              frame={{ width: contentWidth }}
            >
              <HStack frame={{ width: contentWidth }}>
                <Text
                  font={layout.titleFont}
                  fontWeight="bold"
                  foregroundStyle={C.primary}
                  lineLimit={1}
                  minScaleFactor={0.75}
                >
                  {window.label}
                </Text>
                <Spacer minLength={4} />
                <ValueText
                  remaining={remaining}
                  small={small}
                  font={layout.valueFont}
                />
              </HStack>
              <Progress
                displayValue={remaining}
                usedPercent={window.usedPercent}
                remainingPercent={window.remainingPercent}
                width={contentWidth}
                height={layout.trackHeight}
              />
            </VStack>
          );
        })}
        {!small ? (
          <HStack frame={{ width: contentWidth }}>
            <Text font={10} foregroundStyle={C.secondary} lineLimit={1}>
              {`重置 ${formatResetDate(rows[0].resetAt)}`}
            </Text>
            <Spacer />
            <ResetCreditsChip model={model} small={small} />
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

function EmptyWindowView({
  model,
  provider,
  family,
}: {
  model: Model;
  provider: ProviderId;
  family: string;
}) {
  const small = isSmall(family);
  const pad = small ? 12 : 16;
  const contentWidth = Math.max(90, displayWidth(family) - pad * 2);
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }}
        padding={{ trailing: small ? -6 : -8, bottom: small ? -6 : -10 }}
      >
        <Watermark provider={provider} size={small ? 96 : 140} />
      </HStack>
      <VStack
        spacing={12}
        alignment="leading"
        padding={pad}
        frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      >
        <Header model={model} provider={provider} small={small} width={contentWidth} />
        <Spacer />
        <Text font={12} foregroundStyle={C.secondary}>
          {model.snapshot ? EMPTY_ALL_HIDDEN : EMPTY_NO_WINDOW}
        </Text>
        <Spacer />
      </VStack>
    </ZStack>
  );
}

export function AccountUsageWidgetView({
  provider,
  result,
  family,
  hiddenWindowIds,
}: Props) {
  const model = modelFor(provider, result, hiddenWindowIds || []);
  const presentation = widgetPresentation(model.rows.length);
  if (presentation === "single") {
    return (
      <SingleWindowView
        model={model}
        provider={provider}
        window={model.rows[0]}
        family={family}
      />
    );
  }
  if (presentation === "dual") {
    return (
      <DualWindowView
        model={model}
        provider={provider}
        rows={model.rows}
        family={family}
      />
    );
  }
  if (presentation === "multi") {
    return (
      <MultiWindowView
        model={model}
        provider={provider}
        rows={model.rows}
        family={family}
      />
    );
  }
  return (
    <EmptyWindowView model={model} provider={provider} family={family} />
  );
}
