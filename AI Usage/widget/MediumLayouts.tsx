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

export type MediumWindowItem = {
  title: string;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  usedText?: string;
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
  height?: number;
}) {
  const height = props.height ?? 6.5;
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

/** 分支 1：单窗口沉浸看板型 Medium 布局（全系统一 Header 与自适应双/单行网格） */
export function ImmersiveSingleMediumLayout(props: {
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
  const percent = props.remainingText;
  const optionalMeta = props.optionalMeta;
  const hasOptional = optionalMeta != null;

  // 根据是否有额外重置包，采用两套独立的自适应精密坐标（大字到进度条间距完全等比对齐 Small）
  const pos = hasOptional
    ? {
        badgeTop: 9,
        titleTop: 36,
        valueTop: 56,
        progressTop: 104,
        infoTop: 118,
        spacing: 3.5,
      }
    : {
        badgeTop: 10,
        titleTop: 39,
        valueTop: 62,
        progressTop: 111,
        infoTop: 128,
        spacing: 0,
      };

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

      {/* 顶部 Header：左侧 PlanBadge，右侧刷新时间（与 Medium 2/3 窗口统一） */}
      <HStack
        alignment="center"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: pos.badgeTop }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="widget"
        />
        <Spacer />
        <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>
          {props.fetchedText}
        </Text>
      </HStack>

      {/* 窗口标题独占行 */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: pos.titleTop }}
      >
        <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
          {props.title}
        </Text>
      </HStack>

      {/* 核心大字与右侧“剩余”：40pt 大数字 + 16pt bold 剩余 */}
      <HStack
        alignment="lastTextBaseline"
        spacing={8}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: pos.valueTop }}
      >
        <Text
          font={40}
          fontWeight="bold"
          foregroundStyle={C.primary}
          minScaleFactor={0.4}
        >
          {percent}
        </Text>
        <Text font={16} fontWeight="bold" foregroundStyle={C.secondary}>
          剩余
        </Text>
      </HStack>

      {/* 进度条 */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: pos.progressTop }}
      >
        <Progress
          usedPercent={props.usedPercent}
          remainingPercent={props.remainingPercent}
          width={contentWidth}
          height={7}
        />
      </HStack>

      {/* 底部元信息网格：对照 Small 单窗口规范（左标签 + 右数据两端对齐） */}
      <VStack
        spacing={pos.spacing}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 20,
          trailing: 20,
          top: pos.infoTop,
        }}
      >
        {/* 行 1：重置时间 */}
        <HStack frame={{ width: contentWidth }}>
          <Text
            font={10.5}
            fontWeight="bold"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            重置时间
          </Text>
          <Spacer />
          <Text
            font={10.5}
            fontWeight="medium"
            foregroundStyle={C.primary}
            lineLimit={1}
          >
            {props.resetText}
          </Text>
        </HStack>

        {/* 行 2（可选）：额外重置次数 */}
        {hasOptional ? (
          <HStack frame={{ width: contentWidth }}>
            <Text
              font={10.5}
              fontWeight="bold"
              foregroundStyle={C.secondary}
              lineLimit={1}
            >
              {optionalMeta.label}
            </Text>
            <Spacer />
            <Text
              font={10.5}
              fontWeight="medium"
              foregroundStyle={C.primary}
              lineLimit={1}
            >
              {optionalMeta.value}
            </Text>
          </HStack>
        ) : null}
      </VStack>

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

function DualWindowRow(props: {
  window: MediumWindowItem;
  width: number;
  top: number;
}) {
  return (
    <>
      {/* 行 1：窗口标题独占行（统一提升为 16pt bold，与单窗口一致） */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: props.top }}
      >
        <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>
          {props.window.title}
        </Text>
      </HStack>
      {/* 行 2：左侧相对重置时间（12pt medium），右侧纯百分比数字（14pt bold） */}
      <HStack
        alignment="lastTextBaseline"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: props.top + 20 }}
      >
        <Text
          font={12}
          fontWeight="medium"
          foregroundStyle={C.secondary}
          lineLimit={1}
        >
          {props.window.resetText}
        </Text>
        <Spacer minLength={8} />
        <Text
          font={14}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
        >
          {props.window.remainingText}
        </Text>
      </HStack>
      {/* 行 3：进度条收底（呼吸间距） */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: props.top + 40 }}
      >
        <Progress
          usedPercent={props.window.usedPercent}
          remainingPercent={props.window.remainingPercent}
          width={props.width}
          height={6.5}
        />
      </HStack>
    </>
  );
}

/** 分支 2：双窗口标准列表型 Medium 布局（自适应有/无重置包排版） */
export function StandardDualMediumLayout(props: {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  fetchedText: string;
  first: MediumWindowItem;
  second: MediumWindowItem;
  optionalMeta?: MediumOptionalMeta;
  errorText?: string;
}) {
  const contentWidth = Math.max(220, props.width - 40);
  const optionalMeta = props.optionalMeta;
  const hasOptional = optionalMeta != null;

  // 根据是否有额外重置包，采用两套独立的自适应精密坐标系统
  const pos = hasOptional
    ? {
        badgeTop: 9,
        firstTop: 34,
        secondTop: 87,
        infoTop: 140,
      }
    : {
        badgeTop: 10,
        firstTop: 38,
        secondTop: 96,
        infoTop: 145,
      };

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
        alignment="center"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: pos.badgeTop }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="widget"
        />
        <Spacer />
        <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>
          {props.fetchedText}
        </Text>
      </HStack>
      <DualWindowRow
        window={props.first}
        width={contentWidth}
        top={pos.firstTop}
      />
      <DualWindowRow
        window={props.second}
        width={contentWidth}
        top={pos.secondTop}
      />
      {/* 底部可选元信息行：两端对齐格式 */}
      {hasOptional ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 20, trailing: 20, top: pos.infoTop }}
        >
          <Text
            font={10.5}
            fontWeight="bold"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            {optionalMeta.label}
          </Text>
          <Spacer />
          <Text
            font={10.5}
            fontWeight="medium"
            foregroundStyle={C.primary}
            lineLimit={1}
          >
            {optionalMeta.value}
          </Text>
        </HStack>
      ) : null}
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

function TripleWindowRow(props: {
  window: MediumWindowItem;
  width: number;
  top: number;
}) {
  const barOffset = 19;
  const barHeight = 5.5;
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
        <Text
          font={13}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {props.window.title}
        </Text>
        <Spacer minLength={6} />
        <HStack spacing={5} alignment="lastTextBaseline">
          <Text
            font={10}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            {props.window.resetText}
          </Text>
          <Text font={14} fontWeight="bold" foregroundStyle={C.primary}>
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
        padding={{ leading: 20, top: props.top + barOffset }}
      >
        <Progress
          usedPercent={props.window.usedPercent}
          remainingPercent={props.window.remainingPercent}
          width={props.width}
          height={barHeight}
        />
      </HStack>
    </>
  );
}

/** 分支 3：三/四窗口全景型 Medium 布局（纵向堆叠，四窗口收紧行距） */
export function PanoramicTripleMediumLayout(props: {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  fetchedText: string;
  windows: MediumWindowItem[];
  optionalMeta?: MediumOptionalMeta;
  errorText?: string;
}) {
  const contentWidth = Math.max(220, props.width - 40);
  const stacked = props.windows.slice(0, 4);
  const isQuad = stacked.length >= 4;
  const optionalMeta = props.optionalMeta;
  const hasOptional = optionalMeta != null && !isQuad;
  const rowTops = isQuad
    ? [32, 63, 94, 125]
    : hasOptional
      ? [42, 76, 110]
      : [44, 78, 112];
  const headerTop = isQuad ? 9 : 18;
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
        alignment="center"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: headerTop }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="widget"
        />
        <Spacer />
        <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
          {props.fetchedText}
        </Text>
      </HStack>
      {stacked.map((window, index) => (
        <TripleWindowRow
          key={`${window.title}:${index}`}
          window={window}
          width={contentWidth}
          top={rowTops[index] ?? 24}
        />
      ))}
      {hasOptional ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 20, trailing: 20, top: 145 }}
        >
          <Text font={8} fontWeight="medium" foregroundStyle={C.secondary}>
            {optionalMeta.label}
            {optionalMeta.value ? ` · ${optionalMeta.value}` : ""}
          </Text>
        </HStack>
      ) : null}
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
