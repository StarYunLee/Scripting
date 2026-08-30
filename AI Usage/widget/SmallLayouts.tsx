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
  label: string;
  value: string;
} | null;

export type SmallWindowItem = {
  title: string;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  usedText?: string;
  remainingText: string;
  resetText: string;
};

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

/** 分支 1：单窗口焦点型 Small 布局（工整饱满双/三行网格） */
export function FocusSingleSmallLayout(props: {
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
}) {
  const contentWidth = Math.max(90, props.width - 24);
  const verticalOffset = Math.max(0, (displayHeight() - 158) / 2);
  const optionalMeta = props.optionalMeta;
  const hasOptional = optionalMeta != null;

  // 根据是否有额外重置包，自适应最佳垂直排版
  const pos = hasOptional
    ? {
        badgeTop: 11,
        titleTop: 35,
        valueTop: 53,
        progressTop: 92,
        infoTop: 106,
        spacing: 3.5,
      }
    : {
        badgeTop: 11,
        titleTop: 36,
        valueTop: 55,
        progressTop: 96,
        infoTop: 112,
        spacing: 5,
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
        padding={{ trailing: -6, bottom: -6 }}
      >
        <Watermark path={props.watermarkPath} />
      </HStack>

      {/* 顶部：套餐标签（左对齐） */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: pos.badgeTop + verticalOffset,
        }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="widget-small"
        />
      </HStack>

      {/* 窗口标题独占行 */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: pos.titleTop + verticalOffset,
        }}
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

      {/* 核心大字与右对齐“剩余”：左侧 32pt 剩余百分比，右侧右对齐 12pt“剩余” */}
      <HStack
        alignment="lastTextBaseline"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: pos.valueTop + verticalOffset,
        }}
      >
        <Text
          font={32}
          fontWeight="bold"
          foregroundStyle={C.primary}
          minScaleFactor={0.7}
        >
          {props.remainingText}
        </Text>
        <Spacer minLength={8} />
        <Text
          font={12}
          fontWeight="semibold"
          foregroundStyle={C.secondary}
          lineLimit={1}
        >
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
        padding={{
          leading: 12,
          top: pos.progressTop + verticalOffset,
        }}
      >
        <Progress
          usedPercent={props.usedPercent}
          remainingPercent={props.remainingPercent}
          width={contentWidth}
          height={7}
        />
      </HStack>

      {/* 底部纯文本双端对齐网格 */}
      <VStack
        spacing={pos.spacing}
        alignment="leading"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: pos.infoTop + verticalOffset,
        }}
      >
        {/* 行 1：重置时间 */}
        <HStack frame={{ width: contentWidth }}>
          <Text
            font={10}
            fontWeight="bold"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            重置时间
          </Text>
          <Spacer minLength={6} />
          <Text
            font={10}
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
              font={10}
              fontWeight="bold"
              foregroundStyle={C.secondary}
              lineLimit={1}
            >
              {optionalMeta.label}
            </Text>
            <Spacer minLength={6} />
            <Text
              font={10}
              fontWeight="medium"
              foregroundStyle={C.primary}
              lineLimit={1}
            >
              {optionalMeta.value}
            </Text>
          </HStack>
        ) : null}

        {/* 尾行：刷新时间 */}
        <HStack frame={{ width: contentWidth }}>
          <Text
            font={10}
            fontWeight="bold"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            刷新时间
          </Text>
          <Spacer minLength={6} />
          <Text
            font={10}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
          >
            {props.fetchedText}
          </Text>
        </HStack>
      </VStack>
    </ZStack>
  );
}

function DualWindowRow(props: {
  window: SmallWindowItem;
  width: number;
  top: number;
}) {
  return (
    <>
      {/* 行 1：窗口标题独占行（与单额度一致，14pt bold） */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: props.top }}
      >
        <Text
          font={14}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {props.window.title}
        </Text>
      </HStack>
      {/* 行 2：左侧相对重置时间（10pt medium，次要色），右侧纯百分比数字（12pt bold） */}
      <HStack
        alignment="lastTextBaseline"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: props.top + 18 }}
      >
        <Text
          font={10}
          fontWeight="medium"
          foregroundStyle={C.secondary}
          lineLimit={1}
        >
          {props.window.resetText}
        </Text>
        <Spacer minLength={4} />
        <Text
          font={12}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
        >
          {props.window.remainingText}
        </Text>
      </HStack>
      {/* 行 3：进度条收底 */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, top: props.top + 35 }}
      >
        <Progress
          usedPercent={props.window.usedPercent}
          remainingPercent={props.window.remainingPercent}
          width={props.width}
          height={6}
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

/** 分支 2：双窗口紧凑型 Small 布局 */
export function CompactDualSmallLayout(props: {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  first: SmallWindowItem;
  second: SmallWindowItem;
  fetchedText: string;
}) {
  const contentWidth = Math.max(90, props.width - 24);
  const verticalOffset = Math.max(0, (displayHeight() - 158) / 2);
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
          top: 11 + verticalOffset,
        }}
      >
        <PlanBadge
          provider={props.provider}
          label={props.planLabel}
          size="widget-small"
        />
      </HStack>
      <DualWindowRow
        window={props.first}
        width={contentWidth}
        top={38 + verticalOffset}
      />
      <DualWindowRow
        window={props.second}
        width={contentWidth}
        top={89 + verticalOffset}
      />
      {/* 底部刷新时间两端对齐：标签与数值均为次要色 */}
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{
          leading: 12,
          trailing: 12,
          top: 136 + verticalOffset,
        }}
      >
        <Text
          font={10}
          fontWeight="bold"
          foregroundStyle={C.secondary}
          lineLimit={1}
        >
          刷新时间
        </Text>
        <Spacer minLength={6} />
        <Text
          font={10}
          fontWeight="medium"
          foregroundStyle={C.secondary}
          lineLimit={1}
        >
          {props.fetchedText}
        </Text>
      </HStack>
    </ZStack>
  );
}
