import { HStack, Image, Script, Spacer, Text, VStack, ZStack } from "scripting";
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
  warn: "systemOrange" as Color,
};

export type MediumQuotaWindow = {
  title: string;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  usedText: string;
  remainingText: string;
  resetText: string;
};

export type MediumOptionalMeta = {
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
      frame={{ width: 140, height: 140 }}
    />
  );
}

function Progress(props: {
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
}) {
  const shown =
    props.remainingPercent == null
      ? null
      : Math.max(0, Math.min(100, props.remainingPercent));
  const fill = shown == null ? 0 : (props.width * shown) / 100;
  return (
    <ZStack alignment="leading" frame={{ width: props.width, height: 7 }}>
      <HStack
        frame={{ width: props.width, height: 7 }}
        background={C.track}
        border={{ style: C.trackBorder, width: 0.5 }}
        clipShape={{ type: "capsule", style: "continuous" }}
      />
      {fill > 0 ? (
        <HStack
          frame={{ width: Math.max(7, fill), height: 7 }}
          background={usageTint(props.usedPercent, props.remainingPercent)}
          clipShape={{ type: "capsule", style: "continuous" }}
        />
      ) : null}
    </ZStack>
  );
}

function MetaColumn(props: {
  icon: string;
  label: string;
  value: string;
  width: number;
  alignment: "leading" | "center" | "trailing";
}) {
  return (
    <VStack
      spacing={1}
      alignment={props.alignment}
      frame={{ width: props.width }}
    >
      <HStack
        spacing={3}
        frame={{ width: props.width, alignment: props.alignment }}
      >
        <Image
          systemName={props.icon}
          resizable
          scaleToFit
          imageScale="small"
          foregroundStyle={C.secondary}
          frame={{ width: 10, height: 10 }}
        />
        <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>
          {props.label}
        </Text>
      </HStack>
      <HStack frame={{ width: props.width, alignment: props.alignment }}>
        <Text
          font={10}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {props.value}
        </Text>
      </HStack>
    </VStack>
  );
}

export function SingleQuotaMediumView(props: {
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
  optionalMeta: MediumOptionalMeta;
  errorText?: string;
}) {
  const contentWidth = Math.max(180, props.width - 40);
  const gap = 8;
  const columns = props.optionalMeta ? 3 : 2;
  const columnWidth = Math.max(
    58,
    (contentWidth - gap * (columns - 1)) / columns,
  );
  const percent = props.remainingText;
  const used = props.usedText;
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
        <Watermark path={props.watermarkPath} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 9 }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="regular"
        />
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
            已用 {used}
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
          {props.title}
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
          {percent}
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
          usedPercent={props.usedPercent}
          remainingPercent={props.remainingPercent}
          width={contentWidth}
        />
      </HStack>
      <HStack
        spacing={gap}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 124 }}
      >
        <MetaColumn
          icon="clock"
          label="刷新时间"
          value={props.fetchedText}
          width={columnWidth}
          alignment="leading"
        />
        {props.optionalMeta ? (
          <MetaColumn
            icon="arrow.clockwise"
            label={props.optionalMeta.label}
            value={props.optionalMeta.value}
            width={columnWidth}
            alignment="center"
          />
        ) : null}
        <MetaColumn
          icon="calendar"
          label="重置时间"
          value={props.resetText}
          width={columnWidth}
          alignment="trailing"
        />
      </HStack>
      {props.errorText ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 20, bottom: 2 }}
        >
          <Text font={8} foregroundStyle={C.warn} lineLimit={1}>
            {props.errorText}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}

function DualResetRow(props: {
  window: MediumQuotaWindow;
  optionalMeta?: MediumOptionalMeta;
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
      <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>
        重置时间
      </Text>
      <Text
        font={10}
        fontWeight="bold"
        foregroundStyle={C.primary}
        lineLimit={1}
      >
        {props.window.resetText}
      </Text>
      {props.optionalMeta ? (
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
          <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>
            {props.optionalMeta.label}
          </Text>
          <Text
            font={10}
            fontWeight="bold"
            foregroundStyle={C.primary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {props.optionalMeta.value}
          </Text>
        </>
      ) : null}
    </HStack>
  );
}

function DualWindow(props: {
  window: MediumQuotaWindow;
  width: number;
  top: number;
  optionalMeta?: MediumOptionalMeta;
}) {
  const percent = props.window.remainingText;
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
          {props.window.title}
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
          <Text font={14} fontWeight="bold" foregroundStyle={C.primary}>
            剩余 {percent}
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
          usedPercent={props.window.usedPercent}
          remainingPercent={props.window.remainingPercent}
          width={props.width}
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
        <DualResetRow window={props.window} optionalMeta={props.optionalMeta} />
      </HStack>
    </>
  );
}

export function DualQuotaMediumView(props: {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  fetchedText: string;
  first: MediumQuotaWindow;
  second: MediumQuotaWindow;
  secondOptionalMeta?: MediumOptionalMeta;
  errorText?: string;
}) {
  const contentWidth = Math.max(220, props.width - 40);
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
        <Watermark path={props.watermarkPath} />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 9 }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="regular"
        />
        <Spacer />
        <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
          刷新 {props.fetchedText}
        </Text>
      </HStack>
      <DualWindow window={props.first} width={contentWidth} top={38} />
      <DualWindow
        window={props.second}
        width={contentWidth}
        top={96}
        optionalMeta={props.secondOptionalMeta}
      />
      {props.errorText ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 20, bottom: 2 }}
        >
          <Text font={8} foregroundStyle={C.warn} lineLimit={1}>
            {props.errorText}
          </Text>
        </HStack>
      ) : null}
    </ZStack>
  );
}
