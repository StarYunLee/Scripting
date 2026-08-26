import {
  EmptyView,
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
import {
  KIMI_WIDGET,
  kimiWidgetColors,
} from "../../providers/kimi/theme";
import { PlanBadge } from "./PlanBadge";
import type {
  FocusWindow,
  LimitWindow,
  UsageResult,
  UsageSnapshot,
  WidgetStyle,
} from "../../providers/kimi/types";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow?: FocusWindow;
  widgetStyle?: WidgetStyle;
};

const C = kimiWidgetColors();

type Model = {
  snapshot: UsageSnapshot | null;
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};

function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  let fiveHour = snapshot?.fiveHour || null;
  let weekly = snapshot?.weekly || null;
  if (snapshot?.windows?.length) {
    for (const window of snapshot.windows) {
      if (!fiveHour && window.id.includes("five")) fiveHour = window;
      if (!weekly && window.name === "weekly") weekly = window;
    }
    if (!fiveHour && snapshot.windows[0]) fiveHour = snapshot.windows[0];
    if (!weekly && snapshot.windows[1]) weekly = snapshot.windows[1];
  }
  return {
    snapshot,
    fiveHour,
    weekly,
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
      ) : <EmptyView />}
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
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
}) {
  const values = [props.fiveHour, props.weekly]
    .map((window) => window?.remainingPercent)
    .flatMap((value) => (value != null && !Number.isNaN(value) ? [value] : []));
  if (!values.length) return <EmptyView />;
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

function singleWindowTitle(focus: FocusWindow): string {
  return focus === "five_hour"
    ? KIMI_WIDGET.fiveHourTitle
    : KIMI_WIDGET.weeklyTitle;
}

function SingleInfoRow(props: {
  icon: string;
  label: string;
  value: string;
  width: number;
}) {
  const valueWidth = 76;
  return (
    <HStack spacing={4} frame={{ width: props.width }}>
      <Image
        systemName={props.icon}
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
        {props.label}
      </Text>
      <Spacer minLength={0} />
      <Text
        font={9}
        fontWeight="bold"
        foregroundStyle={C.primary}
        monospacedDigit
        lineLimit={1}
        minScaleFactor={0.65}
        frame={{
          width: valueWidth,
          alignment: props.value === "—" ? "center" : "leading",
        }}
      >
        {props.value}
      </Text>
    </HStack>
  );
}

function SingleWindowView(props: {
  model: Model;
  family: string;
  focusWindow: FocusWindow;
}) {
  const model = props.model;
  const small = isSmall(props.family);
  const width = displayWidth(props.family);
  const focus =
    props.focusWindow === "five_hour"
      ? model.fiveHour || model.weekly
      : model.weekly || model.fiveHour;
  const shown = focus?.remainingPercent;
  const title = singleWindowTitle(props.focusWindow);
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
        ) : <EmptyView />}
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
          background={C.capsuleBg}
          clipShape={{ type: "capsule", style: "continuous" }}
        >
          <Text font={12} fontWeight="semibold" foregroundStyle={C.capsuleFg}>
            已用 {formatPercent(focus?.usedPercent)}
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
          剩余
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
      ) : <EmptyView />}
    </ZStack>
  );
}

export function UsageWidgetView({ result, family, focusWindow, widgetStyle }: Props) {
  const model = modelFor(result);
  if (widgetStyle === "single")
    return (
      <SingleWindowView
        model={model}
        family={family}
        focusWindow={focusWindow ?? "five_hour"}
      />
    );
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
          title={KIMI_WIDGET.shortFiveHour}
          window={model.fiveHour}
          width={contentWidth}
          top={43}
        />
        <SmallWindow
          title={KIMI_WIDGET.shortWeekly}
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
        ) : <EmptyView />}
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
          <MinRemainingCapsule
            fiveHour={model.fiveHour}
            weekly={model.weekly}
          />
          <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
            更新 {model.fetched}
          </Text>
        </VStack>
      </HStack>
      <MediumWindow
        title={KIMI_WIDGET.fiveHourTitle}
        window={model.fiveHour}
        width={contentWidth}
        top={38}
      />
      <MediumWindow
        title={KIMI_WIDGET.weeklyTitle}
        window={model.weekly}
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
      ) : <EmptyView />}
    </ZStack>
  );
}
