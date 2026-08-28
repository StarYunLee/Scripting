import { Widget } from "scripting";
import { formatPercent, formatResetDate } from "../../providers/zai/format";
import type { LimitWindow, UsageResult } from "../../providers/zai/types";
import { DualQuotaSmallView } from "../SmallQuotaViews";
import { DualQuotaMediumView } from "../MediumQuotaViews";

type Props = { result: UsageResult; family: string };

function emptyWindow(
  name: "five_hour" | "weekly" | "monthly" | "web_search",
  label: string,
): LimitWindow {
  return {
    id: `zai:empty:${name}`,
    name,
    label,
    usedPercent: null,
    remainingPercent: null,
    resetAt: null,
    resetAtMs: null,
    windowSeconds: null,
  };
}

function coreWindows(result: UsageResult): [LimitWindow, LimitWindow] {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const first =
    snapshot?.fiveHour ||
    snapshot?.windows.find((window) => window.name === "five_hour") ||
    emptyWindow("five_hour", "5 小时");
  const second =
    snapshot?.weekly ||
    snapshot?.monthly ||
    snapshot?.windows.find(
      (window) =>
        window.name === "weekly" ||
        window.name === "monthly" ||
        window.name === "web_search",
    ) ||
    emptyWindow("weekly", "每周");
  return [first, second];
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
  const [first, second] = coreWindows(props.result);
  const width = displayWidth(props.family);
  const planLabel = snapshot?.planLabel || snapshot?.planType || "Z.ai";
  const fetchedText = formatResetDate(snapshot?.fetchedAt);
  const errorText = props.result.ok ? undefined : props.result.error.message;
  const isSmall =
    props.family.toLowerCase().includes("small") &&
    !props.family.toLowerCase().includes("medium");
  const smallWindow = (window: LimitWindow) => ({
    title: window.label,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent,
    remainingText: percent(window.remainingPercent),
    resetText: formatResetDate(window.resetAt),
  });
  const mediumWindow = (window: LimitWindow) => ({
    ...smallWindow(window),
    usedText: percent(window.usedPercent),
  });

  if (isSmall)
    return (
      <DualQuotaSmallView
        width={width}
        provider="zai"
        planLabel={planLabel}
        watermarkPath="assets/watermark-zai.png"
        first={smallWindow(first)}
        second={smallWindow(second)}
        fetchedText={fetchedText}
      />
    );
  return (
    <DualQuotaMediumView
      width={width}
      provider="zai"
      planLabel={planLabel}
      watermarkPath="assets/watermark-zai.png"
      fetchedText={fetchedText}
      first={mediumWindow(first)}
      second={mediumWindow(second)}
      errorText={errorText}
    />
  );
}
