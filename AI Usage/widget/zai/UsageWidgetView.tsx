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
import { usageTint } from "../../services/usage-colors";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/zai/format";
import { ZAI_WIDGET, zaiWidgetColors } from "../../providers/zai/theme";
import { PlanBadge } from "./PlanBadge";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/zai/types";

type Props = {
  result: UsageResult;
  family: string;
};

const C = zaiWidgetColors();

type Model = {
  snapshot: UsageSnapshot | null;
  primary: LimitWindow | null;
  secondary: LimitWindow | null;
  primaryShort: string;
  secondaryShort: string;
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};

function shortLabel(window: LimitWindow | null): string {
  if (!window) return "—";
  if (window.name === "five_hour") return ZAI_WIDGET.shortFiveHour;
  if (window.name === "weekly") return ZAI_WIDGET.shortWeekly;
  if (window.name === "monthly") return ZAI_WIDGET.shortMonthly;
  return window.label;
}

function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const fiveHour = snapshot?.fiveHour || null;
  const weekly = snapshot?.weekly || null;
  const monthly = snapshot?.monthly || null;

  const primary = fiveHour || weekly || snapshot?.windows?.[0] || null;
  let secondary: LimitWindow | null = null;
  if (fiveHour) secondary = weekly || monthly || null;
  else if (weekly) secondary = monthly || null;
  else secondary = snapshot?.windows?.[1] || null;

  return {
    snapshot,
    primary,
    secondary,
    primaryShort: shortLabel(primary),
    secondaryShort: shortLabel(secondary),
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
      filePath={`${Script.directory}/assets/watermark-zai.png`}
      resizable
      scaleToFit
      renderingMode="template"
      foregroundStyle={C.watermark}
      frame={{ width: size, height: size }}
    />
  );
}

function Progress(props: {
  displayValue: number | null;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
  height?: number;
}) {
  const height = props.height ?? 5;
  const shown =
    props.displayValue == null
      ? null
      : Math.max(0, Math.min(100, props.displayValue));
  const fill = shown == null ? 0 : (props.width * shown) / 100;
  return (
    <ZStack alignment="leading" frame={{ width: props.width, height }}>
      <HStack
        frame={{ width: props.width, height }}
        background={C.track}
        border={{ style: C.trackBorder, width: 0.5 }}
        clipShape={{ type: "capsule", style: "continuous" }}
      />
      {fill > 0 ? (
        <HStack
          frame={{ width: Math.max(height, fill), height }}
          background={usageTint(props.usedPercent, props.remainingPercent)}
          clipShape={{ type: "capsule", style: "continuous" }}
        />
      ) : null}
    </ZStack>
  );
}

function shownPercent(window: LimitWindow | null): string {
  return formatPercent(window?.remainingPercent);
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
      <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
        重置
      </Text>
      <Text
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

function SmallWindow(props: {
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
        padding={{ leading: 12, trailing: 12, top: props.top }}
      >
        <Text font={12} fontWeight="bold" foregroundStyle={C.accent}>
          {props.title}
        </Text>
        <Spacer />
        <HStack alignment="center" spacing={3}>
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.accent}
            frame={{ width: 10, height: 10 }}
          />
          <Text font={11} fontWeight="bold" foregroundStyle={C.primary}>
            剩余 {shownPercent(props.window)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, top: props.top + 20 }}
      >
        <Progress
          displayValue={props.window?.remainingPercent ?? null}
          usedPercent={props.window?.usedPercent}
          remainingPercent={props.window?.remainingPercent}
          width={props.width}
          height={5}
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: props.top + 30 }}
      >
        <SmallReset value={formatSmallDate(props.window?.resetAt)} />
      </HStack>
    </>
  );
}

function MediumWindow(props: {
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
        padding={{ leading: 20, trailing: 20, top: props.top }}
      >
        <Text font={15} fontWeight="bold" foregroundStyle={C.primary}>
          {props.title}
        </Text>
        <Spacer />
        <HStack alignment="center" spacing={4}>
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.accent}
            frame={{ width: 12, height: 12 }}
          />
          <Text font={14} fontWeight="bold" foregroundStyle={C.primary}>
            剩余 {shownPercent(props.window)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: props.top + 24 }}
      >
        <Progress
          displayValue={props.window?.remainingPercent ?? null}
          usedPercent={props.window?.usedPercent}
          remainingPercent={props.window?.remainingPercent}
          width={props.width}
          height={7}
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: props.top + 36 }}
      >
        <SmallReset value={formatResetDate(props.window?.resetAt)} />
      </HStack>
    </>
  );
}

function MinRemainingCapsule(props: {
  primary: LimitWindow | null;
  secondary: LimitWindow | null;
}) {
  const values = [props.primary, props.secondary]
    .map((window) => window?.remainingPercent)
    .filter((value) => value != null && !Number.isNaN(value));
  if (!values.length) return null;
  const min = Math.min(...values);
  return (
    <HStack
      padding={{ horizontal: 10, vertical: 6 }}
      background={C.capsuleBg}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <Text font={12} fontWeight="semibold" foregroundStyle={C.capsuleFg}>
        最低剩余 {formatPercent(min)}
      </Text>
    </HStack>
  );
}

export function UsageWidgetView({ result, family }: Props) {
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
            font={8}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {formatSmallDate(model.snapshot?.fetchedAt)}
          </Text>
        </HStack>
        <SmallWindow
          title={model.primaryShort}
          window={model.primary}
          width={contentWidth}
          top={43}
        />
        <SmallWindow
          title={model.secondaryShort}
          window={model.secondary}
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
  const primaryTitle = model.primary?.label || ZAI_WIDGET.fiveHourTitle;
  const secondaryTitle = model.secondary?.label || ZAI_WIDGET.weeklyTitle;
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
        alignment="top"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 9 }}
      >
        <PlanBadge label={model.planLabel} />
        <Spacer minLength={0} />
        <VStack alignment="trailing" spacing={4}>
          <MinRemainingCapsule primary={model.primary} secondary={model.secondary} />
          <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
            更新 {model.fetched}
          </Text>
        </VStack>
      </HStack>
      <MediumWindow
        title={primaryTitle}
        window={model.primary}
        width={contentWidth}
        top={38}
      />
      <MediumWindow
        title={secondaryTitle}
        window={model.secondary}
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
