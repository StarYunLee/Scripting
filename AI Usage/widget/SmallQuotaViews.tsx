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
import type { ProviderId } from "../models";
import { PlanBadge } from "../components/PlanBadge";
import { usageTint } from "../services/usage-colors";

const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});

const C = {
  bg: "systemBackground" as Color,
  primary: "label" as Color,
  secondary: "secondaryLabel" as Color,
  track: dynamic("#C7C8CC", "#55565C"),
  trackBorder: dynamic("rgba(0,0,0,0.07)", "rgba(255,255,255,0.10)"),
  watermark: dynamic("rgba(35,35,38,0.09)", "rgba(245,245,247,0.075)"),
};

export type SmallOptionalMeta = {
  icon: string;
  label: string;
  value: string;
} | null;

function Watermark(props: { path: string }) {
  return (
    <Image
      filePath={`${Script.directory}/${props.path}`}
      resizable
      scaleToFit
      renderingMode="template"
      foregroundStyle={C.watermark}
      frame={{ width: 96, height: 96 }}
    />
  );
}

function Progress(props: {
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
  height?: number;
}) {
  const height = props.height ?? 7;
  const shown =
    props.remainingPercent == null
      ? null
      : Math.max(0, Math.min(100, props.remainingPercent));
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

function compactOptionalLabel(label: string): string {
  return label.replace(/^重置\s*(\d+)\s*次$/, "重置$1次");
}

function normalizeSmallDateText(value: string): string {
  return value.replace(
    /^(\d{1,2})月(\d{1,2})日(.*)$/,
    (_, month: string, day: string, rest: string) =>
      `${month.padStart(2, "0")}月${day.padStart(2, "0")}日${rest}`,
  );
}

function InfoRow(props: {
  icon: string;
  label: string;
  value: string;
  width: number;
}) {
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
          width: 76,
          alignment: props.value === "—" ? "center" : "leading",
        }}
      >
        {normalizeSmallDateText(props.value)}
      </Text>
    </HStack>
  );
}

export function SingleQuotaSmallView(props: {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  title: string;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  usedText: string;
  remainingText: string;
  fetchedText: string;
  resetText: string;
  optionalMeta: SmallOptionalMeta;
  additionalText?: string;
}) {
  const contentWidth = Math.max(90, props.width - 24);
  const verticalOffset = props.optionalMeta ? 0 : 6;
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
        <Watermark path={props.watermarkPath} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 12 + verticalOffset }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="small"
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 34 + verticalOffset }}
      >
        <Text
          font={14}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {props.title}
        </Text>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 58 + verticalOffset }}
      >
        <VStack spacing={1} alignment="leading">
          <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
            已用
          </Text>
          <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
            {props.usedText}
          </Text>
        </VStack>
        <Spacer />
        <VStack spacing={1} alignment="trailing">
          <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>
            剩余
          </Text>
          <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
            {props.remainingText}
          </Text>
        </VStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, top: 94 + verticalOffset }}
      >
        <Progress
          usedPercent={props.usedPercent}
          remainingPercent={props.remainingPercent}
          width={contentWidth}
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
        padding={{
          leading: 12,
          trailing: 12,
          top: 108 + verticalOffset,
        }}
      >
        <InfoRow
          icon="calendar"
          label="重置时间"
          value={props.resetText}
          width={contentWidth}
        />
        {props.optionalMeta ? (
          <InfoRow
            icon={props.optionalMeta.icon}
            label={compactOptionalLabel(props.optionalMeta.label)}
            value={props.optionalMeta.value}
            width={contentWidth}
          />
        ) : null}
        <InfoRow
          icon="clock"
          label="刷新时间"
          value={props.fetchedText}
          width={contentWidth}
        />
      </VStack>
      {props.additionalText ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 12, bottom: 1 }}
        >
          <Text
            font={7}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            minScaleFactor={0.5}
          >
            {props.additionalText}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}

export type SmallQuotaWindow = {
  title: string;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  remainingText: string;
  resetText: string;
};

function DualWindowRow(props: {
  window: SmallQuotaWindow;
  width: number;
  top: number;
}) {
  const percentWidth = 52;
  const gap = 4;
  const titleWidth = Math.max(48, props.width - percentWidth - gap);
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
        <Text
          font={12}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.7}
          frame={{ width: titleWidth, alignment: "leading" }}
        >
          {props.window.title}
        </Text>
        <Spacer minLength={gap} />
        <HStack
          alignment="center"
          spacing={3}
          frame={{ width: percentWidth, alignment: "trailing" }}
        >
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.primary}
            frame={{ width: 10, height: 10 }}
          />
          <Text
            font={11}
            fontWeight="bold"
            foregroundStyle={C.primary}
            lineLimit={1}
          >
            {props.window.remainingText}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, top: props.top + 19 }}
      >
        <Progress
          usedPercent={props.window.usedPercent}
          remainingPercent={props.window.remainingPercent}
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
        padding={{ leading: 12, trailing: 12, top: props.top + 32 }}
      >
        <InfoRow
          icon="calendar"
          label="重置"
          value={props.window.resetText}
          width={props.width}
        />
      </HStack>
    </>
  );
}

function displayHeight(): number {
  try {
    const height = (Widget as { displaySize?: { height?: number } }).displaySize
      ?.height;
    if (height && height > 40) return height;
  } catch {
    /* ignore */
  }
  return 158;
}

export function DualQuotaSmallView(props: {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  first: SmallQuotaWindow;
  second: SmallQuotaWindow;
  fetchedText: string;
  additionalText?: string;
}) {
  const contentWidth = Math.max(90, props.width - 24);
  const verticalOffset = 2 + Math.max(0, (displayHeight() - 158) / 2);
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
        <Watermark path={props.watermarkPath} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: 8 + verticalOffset,
        }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="small"
        />
      </HStack>
      <DualWindowRow
        window={props.first}
        width={contentWidth}
        top={34 + verticalOffset}
      />
      <DualWindowRow
        window={props.second}
        width={contentWidth}
        top={85 + verticalOffset}
      />
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: 132 + verticalOffset,
        }}
      >
        <InfoRow
          icon="clock"
          label="刷新"
          value={props.fetchedText}
          width={contentWidth}
        />
      </HStack>
      {props.additionalText ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 12, bottom: 1 }}
        >
          <Text
            font={7}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            minScaleFactor={0.5}
          >
            {props.additionalText}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}
