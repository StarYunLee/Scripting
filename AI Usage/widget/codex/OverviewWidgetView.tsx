import { HStack, Image, Script, Spacer, Text, Widget, ZStack } from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { usageTint } from "../../services/usage-colors";
import {
  formatPercent,
  formatResetDate,
  resetCreditsSummary,
} from "../../providers/codex/format";
import { PlanBadge } from "./PlanBadge";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/codex/types";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow: "weekly" | "five_hour" | "monthly";
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
  planLabel: string;
  resetLabel: string;
  resetExpiration: string;
  fetched: string;
  live: boolean;
  detail: string;
};
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const resets = resetCreditsSummary(
    snapshot?.resetCreditsAvailable,
    snapshot?.resetCreditExpirations,
  );
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
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    resetLabel:
      resets.available == null ? "重置—" : `重置${resets.available}次`,
    resetExpiration: formatResetDate(resets.nearestExpiration),
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
      filePath={`${Script.directory}/assets/watermark-chatgpt.png`}
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
function MediumReset({
  value,
  resetLabel,
  resetExpiration,
}: {
  value: string;
  resetLabel?: string;
  resetExpiration?: string;
}) {
  return (
    <HStack
      alignment="center"
      spacing={3}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
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
      {resetLabel ? (
        <>
          <Spacer />
          <Image
            systemName="arrow.clockwise"
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
            {resetLabel}
          </Text>
          <Text
            fontDesign="default"
            fontWidth="standard"
            font={10}
            fontWeight="bold"
            foregroundStyle={C.primary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {resetExpiration || "—"}
          </Text>
        </>
      ) : null}
    </HStack>
  );
}
function MediumWindow({
  title,
  window,
  width,
  top,
  resetLabel,
  resetExpiration,
}: {
  title: string;
  window: LimitWindow | null;
  width: number;
  top: number;
  resetLabel?: string;
  resetExpiration?: string;
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
        padding={{ leading: 20, trailing: 20, top: top + 36 }}
      >
        <MediumReset
          value={formatResetDate(window?.resetAt)}
          resetLabel={resetLabel}
          resetExpiration={resetExpiration}
        />
      </HStack>
    </>
  );
}

export function OverviewWidgetView({ result, family }: Props) {
  const model = modelFor(result);
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
          padding={{ trailing: -6, bottom: -6 }}
        >
          <Watermark size={96} />
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
          title="5H"
          window={model.fiveHour}
          width={contentWidth}
          top={43}
        />
        <SmallWindow
          title="周限"
          window={model.weekly}
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
        padding={{ trailing: -7, bottom: -11 }}
      >
        <Watermark size={135} />
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
        title="5 小时额度"
        window={model.fiveHour}
        width={contentWidth}
        top={38}
      />
      <MediumWindow
        title="每周额度"
        window={model.weekly}
        width={contentWidth}
        top={96}
        resetLabel={model.resetLabel}
        resetExpiration={model.resetExpiration}
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
