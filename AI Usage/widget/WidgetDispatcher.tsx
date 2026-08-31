import { Widget } from "scripting";
import type { ProviderId, UsageWindowView } from "../models";
import { providerWatermarkPath } from "./watermarks";
import {
  formatCompactRelativeResetAt,
  formatPercent,
  formatRelativeFetchedAt,
  formatRelativeResetAt,
  formatSmallDate,
  formatSmallRelativeFetchedAt,
} from "../services/usage-format";
import { parseWidgetFamily, widgetDispatcherFallbackWidth } from "./family";
import {
  FocusSingleSmallLayout,
  CompactDualSmallLayout,
  type SmallOptionalMeta,
  type SmallWindowItem,
} from "./SmallLayouts";
import {
  ImmersiveSingleMediumLayout,
  StandardDualMediumLayout,
  PanoramicTripleMediumLayout,
  type MediumOptionalMeta,
  type MediumWindowItem,
} from "./MediumLayouts";
import type { NormalizedResetCredits } from "../services/usage-model";

type Props = {
  provider: ProviderId;
  planLabel: string | null;
  windows: UsageWindowView[];
  resetCredits?: NormalizedResetCredits | null;
  fetchedAt?: string | null;
  family: string;
  errorText?: string;
};

function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize
      ?.width;
    if (width && width > 40) return width;
  } catch {
    /* ignore */
  }
  return widgetDispatcherFallbackWidth(family);
}

function resolveOptionalMeta(resetCredits?: NormalizedResetCredits | null): {
  small: SmallOptionalMeta;
  medium: MediumOptionalMeta;
} {
  if (!resetCredits || resetCredits.available <= 0) {
    return { small: null, medium: null };
  }
  const countText = `重置${resetCredits.available}次`;
  const expirationText = resetCredits.nearestExpiration
    ? formatSmallDate(resetCredits.nearestExpiration)
    : "";

  return {
    small: {
      label: countText,
      value: expirationText,
    },
    medium: {
      label: countText,
      value: expirationText,
    },
  };
}

/**
 * 通用小组件分发器（WidgetDispatcher）
 * 根据传入的 windows 数量自动选择最适排版：
 * - Small 尺寸：<=1 项渲染 FocusSingleSmallLayout，>=2 项渲染 CompactDualSmallLayout；
 * - Medium 尺寸：1 项 ImmersiveSingleMediumLayout，2 项 StandardDualMediumLayout，>=3 项 PanoramicTripleMediumLayout（最多 4 项纵向堆叠）。
 */
export function WidgetDispatcher(props: Props) {
  const isSmall = parseWidgetFamily(props.family) === "small";
  const width = displayWidth(props.family);
  const planLabel = props.planLabel || props.provider;
  const watermarkPath = providerWatermarkPath(props.provider);
  const fetchedText = `${formatRelativeFetchedAt(props.fetchedAt)}刷新`;
  const optionalMeta = resolveOptionalMeta(props.resetCredits);

  // 兜底一个空窗口避免无数据时崩溃
  const activeWindows =
    props.windows.length > 0
      ? props.windows
      : [
          {
            id: `${props.provider}:empty`,
            label: "当前用量",
            usedPercent: null,
            remainingPercent: null,
            resetAt: null,
          },
        ];

  if (isSmall) {
    const singleFetchedText =
      props.errorText || formatSmallRelativeFetchedAt(props.fetchedAt);
    // Small 尺寸分支
    if (activeWindows.length <= 1) {
      const w = activeWindows[0];
      return (
        <FocusSingleSmallLayout
          width={width}
          provider={props.provider}
          planLabel={planLabel}
          watermarkPath={watermarkPath}
          title={w.label}
          usedPercent={w.usedPercent}
          remainingPercent={w.remainingPercent}
          usedText={formatPercent(w.usedPercent)}
          remainingText={formatPercent(w.remainingPercent)}
          fetchedText={singleFetchedText}
          resetText={formatRelativeResetAt(w.resetAt)}
          optionalMeta={optionalMeta.small}
        />
      );
    }

    // Small 2 窗口
    const [w1, w2] = activeWindows;
    const toSmallWindow = (w: UsageWindowView): SmallWindowItem => ({
      title: w.label,
      usedPercent: w.usedPercent,
      remainingPercent: w.remainingPercent,
      remainingText: formatPercent(w.remainingPercent),
      resetText: formatRelativeResetAt(w.resetAt),
    });

    return (
      <CompactDualSmallLayout
        width={width}
        provider={props.provider}
        planLabel={planLabel}
        watermarkPath={watermarkPath}
        first={toSmallWindow(w1)}
        second={toSmallWindow(w2)}
        fetchedText={singleFetchedText}
      />
    );
  }

  // Medium 尺寸分支
  if (activeWindows.length === 1) {
    const w = activeWindows[0];
    return (
      <ImmersiveSingleMediumLayout
        width={width}
        provider={props.provider}
        planLabel={planLabel}
        watermarkPath={watermarkPath}
        title={w.label}
        usedPercent={w.usedPercent}
        remainingPercent={w.remainingPercent}
        usedText={formatPercent(w.usedPercent)}
        remainingText={formatPercent(w.remainingPercent)}
        fetchedText={fetchedText}
        resetText={formatRelativeResetAt(w.resetAt)}
        optionalMeta={optionalMeta.medium}
        errorText={props.errorText}
      />
    );
  }

  if (activeWindows.length === 2) {
    const [w1, w2] = activeWindows;
    const toMediumWindow = (w: UsageWindowView): MediumWindowItem => ({
      title: w.label,
      usedPercent: w.usedPercent,
      remainingPercent: w.remainingPercent,
      remainingText: formatPercent(w.remainingPercent),
      resetText: formatRelativeResetAt(w.resetAt),
    });

    return (
      <StandardDualMediumLayout
        width={width}
        provider={props.provider}
        planLabel={planLabel}
        watermarkPath={watermarkPath}
        first={toMediumWindow(w1)}
        second={toMediumWindow(w2)}
        fetchedText={fetchedText}
        optionalMeta={optionalMeta.medium}
        errorText={props.errorText}
      />
    );
  }

  const toStackedWindow = (w: UsageWindowView): MediumWindowItem => ({
    title: w.label,
    usedPercent: w.usedPercent,
    remainingPercent: w.remainingPercent,
    remainingText: formatPercent(w.remainingPercent),
    resetText: formatCompactRelativeResetAt(w.resetAt),
  });

  // Medium 3/4 窗口：纵向堆叠
  return (
    <PanoramicTripleMediumLayout
      width={width}
      provider={props.provider}
      planLabel={planLabel}
      watermarkPath={watermarkPath}
      windows={activeWindows.slice(0, 4).map(toStackedWindow)}
      fetchedText={fetchedText}
      optionalMeta={optionalMeta.medium}
      errorText={props.errorText}
    />
  );
}
