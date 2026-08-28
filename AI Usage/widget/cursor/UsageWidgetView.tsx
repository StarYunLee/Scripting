import { Widget } from "scripting";
import {
  formatFetchedAt,
  formatPercent,
  formatSmallDate,
} from "../../providers/cursor/format";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/cursor/types";
import { DualQuotaSmallView, SingleQuotaSmallView } from "../SmallQuotaViews";
import {
  DualQuotaMediumView,
  SingleQuotaMediumView,
} from "../MediumQuotaViews";

type Props = { result: UsageResult; family: string };

function coreWindows(snapshot: UsageSnapshot | null): LimitWindow[] {
  if (!snapshot) return [];
  const find = (name: LimitWindow["name"]) =>
    snapshot.windows.find((window) => window.name === name) || null;
  const total = snapshot.total || find("total");
  const api = snapshot.api || find("api");
  const auto = snapshot.auto || find("auto");

  // 默认展示总体额度与第三方模型额度；没有 API 额度时回退到 Auto + 总体额度。
  if (total && api) return [total, api];
  if (total && auto) return [auto, total];
  if (total) return [total];
  if (auto && api) return [auto, api];
  if (auto) return [auto];
  if (api) return [api];
  return snapshot.windows.slice(0, 2);
}

function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize
      ?.width;
    if (width && width > 40) return width;
  } catch {
    /* use documented family fallback */
  }
  return family.toLowerCase().includes("small") ? 158 : 338;
}

const percent = (value: number | null | undefined) => formatPercent(value);

export function UsageWidgetView(props: Props) {
  const snapshot = props.result.ok
    ? props.result.snapshot
    : props.result.cache || null;
  const windows = coreWindows(snapshot);
  const first = windows[0] || {
    id: "cursor:empty",
    name: "unknown" as const,
    label: "Cursor 用量",
    usedPercent: null,
    remainingPercent: null,
    resetAt: null,
    resetAtMs: null,
    windowSeconds: null,
  };
  const second = windows[1] || null;
  const width = displayWidth(props.family);
  const planLabel = snapshot?.planLabel || snapshot?.planType || "Cursor";
  const fetchedText = formatFetchedAt(snapshot?.fetchedAt);
  const errorText = props.result.ok ? undefined : props.result.error.message;
  const isSmall =
    props.family.toLowerCase().includes("small") &&
    !props.family.toLowerCase().includes("medium");
  const smallWindow = (window: LimitWindow) => ({
    title: window.label,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent,
    remainingText: percent(window.remainingPercent),
    resetText: formatSmallDate(window.resetAt),
  });
  const mediumWindow = (window: LimitWindow) => ({
    ...smallWindow(window),
    usedText: percent(window.usedPercent),
  });

  if (isSmall && second)
    return (
      <DualQuotaSmallView
        width={width}
        provider="cursor"
        planLabel={planLabel}
        watermarkPath="assets/watermark-cursor.png"
        first={smallWindow(first)}
        second={smallWindow(second)}
        fetchedText={fetchedText}
      />
    );
  if (isSmall)
    return (
      <SingleQuotaSmallView
        width={width}
        provider="cursor"
        planLabel={planLabel}
        watermarkPath="assets/watermark-cursor.png"
        title={first.label}
        usedPercent={first.usedPercent}
        remainingPercent={first.remainingPercent}
        usedText={percent(first.usedPercent)}
        remainingText={percent(first.remainingPercent)}
        fetchedText={fetchedText}
        resetText={formatSmallDate(first.resetAt)}
        optionalMeta={null}
      />
    );
  if (second)
    return (
      <DualQuotaMediumView
        width={width}
        provider="cursor"
        planLabel={planLabel}
        watermarkPath="assets/watermark-cursor.png"
        fetchedText={fetchedText}
        first={mediumWindow(first)}
        second={mediumWindow(second)}
        errorText={errorText}
      />
    );
  return (
    <SingleQuotaMediumView
      width={width}
      provider="cursor"
      planLabel={planLabel}
      watermarkPath="assets/watermark-cursor.png"
      title={first.label}
      usedPercent={first.usedPercent}
      remainingPercent={first.remainingPercent}
      usedText={percent(first.usedPercent)}
      remainingText={percent(first.remainingPercent)}
      fetchedText={fetchedText}
      resetText={formatSmallDate(first.resetAt)}
      optionalMeta={null}
      errorText={errorText}
    />
  );
}
