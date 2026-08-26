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
import { ProviderLogo } from "../../components/ProviderLogo";
import { usageTint } from "../../services/usage-colors";
import { pickFocusWindow } from "../../providers/claude/api";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/claude/format";
import type {
  DualQuotaPreset,
  FocusWindow,
  LimitWindow,
  UsageResult,
  UsageSnapshot,
  WidgetStyle,
} from "../../providers/claude/types";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow: FocusWindow;
  widgetStyle: WidgetStyle;
  dualQuotaPreset: DualQuotaPreset;
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

type Model = {
  snapshot: UsageSnapshot | null;
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  weeklyFable: LimitWindow | null;
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  return {
    snapshot,
    fiveHour:
      snapshot?.fiveHour ||
      snapshot?.windows.find((w) => w.name === "five_hour") ||
      null,
    weekly:
      snapshot?.weekly ||
      snapshot?.windows.find((w) => w.name === "weekly") ||
      null,
    weeklyFable:
      snapshot?.weeklyFable ||
      snapshot?.windows.find((w) => w.name === "weekly_fable") ||
      null,
    planLabel: snapshot?.planLabel || snapshot?.planType || "Claude",
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
      filePath={`${Script.directory}/assets/watermark-claude.png`}
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
  height,
}: {
  displayValue: number | null;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
  height: number;
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
const linear = (light: Color[], dark: Color[] = light): DynamicShapeStyle => ({
  light: {
    gradient: light.map((color, index) => ({
      color,
      location: index / (light.length - 1),
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
  dark: {
    gradient: dark.map((color, index) => ({
      color,
      location: index / (dark.length - 1),
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
});
function normalizedPlan(label: string): string {
  return label
    .replace(/DEMO\s*[·•|-]?\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/^claude\s+/, "")
    .replace(/×/g, "x")
    .replace(/[\s_]+/g, "-");
}
type BadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
};

function badgePalette(label: string): BadgePalette {
  const normalized = normalizedPlan(label);
  if (normalized === "max-20x")
    return {
      text: "MAX 20X",
      background: linear(
        ["#F59E0B", "#EA580C", "#E5254F"],
        ["#FBBF24", "#F97316", "#F43F5E"],
      ),
      foreground: "#000000",
    };
  if (normalized === "max-5x")
    return {
      text: "MAX 5X",
      background: linear(
        ["#F97316", "#F59E0B", "#F43F5E"],
        ["#FB923C", "#FBBF24", "#FB7185"],
      ),
      foreground: "#000000",
    };
  if (normalized === "max")
    return {
      text: "MAX",
      background: linear(
        ["#FB923C", "#F59E0B", "#EA580C"],
        ["#FB923C", "#F59E0B", "#F97316"],
      ),
      foreground: "#000000",
    };
  if (normalized === "pro")
    return {
      text: "PRO",
      background: linear(["#FCD34D", "#FACC15", "#F59E0B"]),
      foreground: "#000000",
    };
  if (normalized.startsWith("team"))
    return {
      text: "TEAM",
      background: linear(["#8B5CF6", "#4F46E5"], ["#A78BFA", "#6366F1"]),
      foreground: "#FFFFFF",
    };
  return {
    text:
      label
        .replace(/^Claude\s+/i, "")
        .trim()
        .toUpperCase() || "CLAUDE",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  };
}
function PlanBadge({
  label,
  small = false,
}: {
  label: string;
  small?: boolean;
}) {
  const p = badgePalette(label);
  return (
    <HStack
      spacing={small ? 5 : 6}
      padding={{ horizontal: small ? 5 : 10, vertical: small ? 3 : 4 }}
      background={p.background}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <ProviderLogo
        provider="claude"
        size={small ? 9 : 11}
        tint={p.foreground}
      />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={small ? 9 : 10}
        fontWeight="bold"
        foregroundStyle={p.foreground}
        lineLimit={1}
        minScaleFactor={1}
      >
        {p.text}
      </Text>
    </HStack>
  );
}
function shownPercent(window: LimitWindow | null): string {
  return formatPercent(window?.remainingPercent);
}
function modeLabel(): string {
  return "剩余";
}
function SmallReset({ value }: { value: string }) {
  return (
    <HStack alignment="center" spacing={3}>
      <Image
        systemName="calendar"
        resizable
        scaleToFit
        imageScale="small"
        foregroundStyle={C.secondary}
        frame={{ width: 9, height: 9 }}
      />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={9}
        fontWeight="medium"
        foregroundStyle={C.secondary}
      >
        重置
      </Text>
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={10}
        fontWeight="bold"
        foregroundStyle={C.primary}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {value}
      </Text>
    </HStack>
  );
}
function SmallWindow({
  title,
  window,
  width,
  top,
}: {
  title: string;
  window: LimitWindow | null;
  width: number;
  top: number;
}) {
  return (
    <>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top }}
      >
        <Text
          fontDesign="default"
          fontWidth="standard"
          font={12}
          fontWeight="bold"
          foregroundStyle={C.primary}
        >
          {title}
        </Text>
        <Spacer />
        <HStack alignment="center" spacing={3}>
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.primary}
            frame={{ width: 10, height: 10 }}
          />
          <Text
            fontDesign="default"
            fontWidth="standard"
            font={11}
            fontWeight="bold"
            foregroundStyle={C.primary}
          >
            {modeLabel()} {shownPercent(window)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, top: top + 20 }}
      >
        <Progress
          displayValue={window?.remainingPercent ?? null}
          usedPercent={window?.usedPercent}
          remainingPercent={window?.remainingPercent}
          width={width}
          height={5}
        />
      </HStack>
      <HStack
        alignment="center"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: top + 30 }}
      >
        <SmallReset value={formatResetDate(window?.resetAt)} />
      </HStack>
    </>
  );
}
function MediumReset({ value }: { value: string }) {
  return (
    <HStack alignment="center" spacing={3}>
      <Image
        systemName="calendar"
        resizable
        scaleToFit
        imageScale="small"
        foregroundStyle={C.secondary}
        frame={{ width: 10, height: 10 }}
      />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={10}
        fontWeight="medium"
        foregroundStyle={C.secondary}
      >
        重置
      </Text>
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={12}
        fontWeight="bold"
        foregroundStyle={C.primary}
        lineLimit={1}
      >
        {value}
      </Text>
    </HStack>
  );
}
function MediumWindow({
  title,
  window,
  width,
  top,
}: {
  title: string;
  window: LimitWindow | null;
  width: number;
  top: number;
}) {
  return (
    <>
      <HStack
        alignment="lastTextBaseline"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top }}
      >
        <Text
          fontDesign="default"
          fontWidth="standard"
          font={15}
          fontWeight="bold"
          foregroundStyle={C.primary}
        >
          {title}
        </Text>
        <Spacer />
        <HStack alignment="center" spacing={4}>
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.primary}
            frame={{ width: 12, height: 12 }}
          />
          <Text
            fontDesign="default"
            fontWidth="standard"
            font={14}
            fontWeight="bold"
            foregroundStyle={C.primary}
          >
            {modeLabel()} {shownPercent(window)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: top + 24 }}
      >
        <Progress
          displayValue={window?.remainingPercent ?? null}
          usedPercent={window?.usedPercent}
          remainingPercent={window?.remainingPercent}
          width={width}
          height={7}
        />
      </HStack>
      <HStack
        alignment="center"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: top + 36 }}
      >
        <MediumReset value={formatResetDate(window?.resetAt)} />
      </HStack>
    </>
  );
}

function singleWindowTitle(focus: FocusWindow): string {
  if (focus === "five_hour") return CLAUDE_WIDGET.fiveHourQuota;
  if (focus === "weekly") return CLAUDE_WIDGET.weeklyQuota;
  return CLAUDE_WIDGET.fableWeekly;
}
function SingleInfoRow({
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
function SingleWindowView({
  model,
  family,
  focusWindow,
}: {
  model: Model;
  family: string;
  focusWindow: FocusWindow;
}) {
  const small = isSmall(family);
  const width = displayWidth(family);
  const focus = model.snapshot
    ? pickFocusWindow(model.snapshot, focusWindow)
    : null;
  const shown = focus?.remainingPercent;
  const title = singleWindowTitle(focusWindow);
  const barWidth = Math.max(90, width - (small ? 24 : 40));

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
            {focusWindow === "five_hour"
              ? CLAUDE_WIDGET.shortFiveHour
              : focusWindow === "weekly_fable"
                ? "Fable"
                : CLAUDE_WIDGET.shortWeekly}
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
              {formatPercent(focus?.usedPercent)}
            </Text>
          </VStack>
          <Spacer />
          <VStack spacing={1} alignment="trailing">
            <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
              剩余
            </Text>
            <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
              {formatPercent(focus?.remainingPercent)}
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
            displayValue={shown ?? null}
            usedPercent={focus?.usedPercent}
            remainingPercent={focus?.remainingPercent}
            width={barWidth}
            height={7}
          />
        </HStack>
        <VStack
          spacing={6}
          alignment="leading"
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, trailing: 12, top: 103 }}
        >
          <SingleInfoRow
            icon="clock"
            label="更新时间"
            value={formatSmallDate(model.snapshot?.fetchedAt)}
            width={barWidth}
          />
          <SingleInfoRow
            icon="calendar"
            label="重置时间"
            value={formatSmallDate(focus?.resetAt)}
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
            <Text font={7} foregroundStyle={C.warn} lineLimit={1}>
              {model.detail}
            </Text>
          </HStack>
        ) : null}
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
        padding={{ trailing: -8, bottom: -12 }}
      >
        <Watermark size={140} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 9 }}
      >
        <PlanBadge label={model.planLabel} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topTrailing",
        }}
        padding={{ trailing: 20, top: 10 }}
      >
        <HStack
          padding={{ horizontal: 10, vertical: 6 }}
          background={C.primary}
          clipShape={{ type: "capsule", style: "continuous" }}
        >
          <Text font={12} fontWeight="semibold" foregroundStyle={C.bg}>
            剩余 {formatPercent(focus?.remainingPercent)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 38 }}
      >
        <Text font={17} fontWeight="bold" foregroundStyle={C.primary}>
          {title}
        </Text>
      </HStack>
      <HStack
        alignment="lastTextBaseline"
        spacing={7}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 59 }}
      >
        <Text
          font={40}
          fontWeight="bold"
          foregroundStyle={C.primary}
          minScaleFactor={0.4}
        >
          {formatPercent(shown)}
        </Text>
        <Text font={12} fontWeight="medium" foregroundStyle={C.secondary}>
          {modeLabel()}
        </Text>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 110 }}
      >
        <Progress
          displayValue={shown ?? null}
          usedPercent={focus?.usedPercent}
          remainingPercent={focus?.remainingPercent}
          width={barWidth}
          height={7}
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 124 }}
      >
        <VStack spacing={1} alignment="leading">
          <Text font={10} foregroundStyle={C.secondary}>
            更新时间
          </Text>
          <Text font={12} fontWeight="bold" foregroundStyle={C.primary}>
            {model.fetched}
          </Text>
        </VStack>
        <Spacer />
        <VStack spacing={1} alignment="trailing">
          <Text font={10} foregroundStyle={C.secondary}>
            重置时间
          </Text>
          <Text font={12} fontWeight="bold" foregroundStyle={C.primary}>
            {formatResetDate(focus?.resetAt)}
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
          padding={{ horizontal: 20, bottom: 2 }}
        >
          <Text font={8} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}

export function UsageWidgetView({
  result,
  family,
  focusWindow,
  widgetStyle,
  dualQuotaPreset,
}: Props) {
  const model = modelFor(result);
  if (widgetStyle === "single")
    return (
      <SingleWindowView
        model={model}
        family={family}
        focusWindow={focusWindow}
      />
    );
  const firstWindow =
    dualQuotaPreset === "weekly_fable" ? model.weekly : model.fiveHour;
  const secondWindow =
    dualQuotaPreset === "weekly_fable" ? model.weeklyFable : model.weekly;
  const firstTitle =
    dualQuotaPreset === "weekly_fable"
      ? CLAUDE_WIDGET.weeklyQuota
      : CLAUDE_WIDGET.fiveHourQuota;
  const secondTitle =
    dualQuotaPreset === "weekly_fable"
      ? CLAUDE_WIDGET.fableWeekly
      : CLAUDE_WIDGET.weeklyQuota;
  const smallFirstTitle =
    dualQuotaPreset === "weekly_fable"
      ? CLAUDE_WIDGET.shortWeekly
      : CLAUDE_WIDGET.shortFiveHour;
  const smallSecondTitle =
    dualQuotaPreset === "weekly_fable"
      ? CLAUDE_WIDGET.shortFableWeekly
      : CLAUDE_WIDGET.shortWeekly;
  const small = isSmall(family);
  const width = displayWidth(family);

  if (small) {
    const contentWidth = Math.max(112, width - 24);
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
          padding={{ trailing: -9, bottom: -9 }}
        >
          <Watermark size={100} />
        </HStack>
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, trailing: 12, top: 18 }}
        >
          <PlanBadge label={model.planLabel} small />
          <Spacer minLength={0} />
          <Text
            fontDesign="default"
            fontWidth="standard"
            font={8}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {model.fetched}
          </Text>
        </HStack>
        <SmallWindow
          title={smallFirstTitle}
          window={firstWindow}
          width={contentWidth}
          top={43}
        />
        <SmallWindow
          title={smallSecondTitle}
          window={secondWindow}
          width={contentWidth}
          top={99}
        />
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
    );
  }

  const contentWidth = Math.max(220, width - 40);
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
        padding={{ trailing: -11, bottom: -13 }}
      >
        <Watermark size={145} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 9 }}
      >
        <PlanBadge label={model.planLabel} />
        <Spacer />
        <Text
          fontDesign="default"
          fontWidth="standard"
          font={9}
          fontWeight="medium"
          foregroundStyle={C.secondary}
        >
          更新 {model.fetched}
        </Text>
      </HStack>
      <MediumWindow
        title={firstTitle}
        window={firstWindow}
        width={contentWidth}
        top={38}
      />
      <MediumWindow
        title={secondTitle}
        window={secondWindow}
        width={contentWidth}
        top={96}
      />
      {!model.live && model.detail ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 20, bottom: 2 }}
        >
          <Text font={8} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}
