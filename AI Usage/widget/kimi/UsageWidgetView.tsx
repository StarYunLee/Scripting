import { Widget } from "scripting";
import {
  formatFetchedAt,
  formatPercent,
  formatSmallDate,
} from "../../providers/kimi/format";
import type { LimitWindow, UsageResult } from "../../providers/kimi/types";
import { DualQuotaSmallView } from "../SmallQuotaViews";
import { DualQuotaMediumView } from "../MediumQuotaViews";

type Props = { result: UsageResult; family: string };

function emptyWindow(name: "five_hour" | "weekly", label: string): LimitWindow {
  return {
    id: `kimi:empty:${name}`,
    name,
    label,
    usedPercent: null,
    remainingPercent: null,
    resetAt: null,
    resetAtMs: null,
    windowSeconds: name === "five_hour" ? 5 * 3600 : 7 * 86400,
  };
}

function coreWindows(result: UsageResult): [LimitWindow, LimitWindow] {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const fiveHour =
    snapshot?.fiveHour ||
    snapshot?.windows.find((window) => window.name === "five_hour") ||
    emptyWindow("five_hour", "5 小时");
  const weekly =
    snapshot?.weekly ||
    snapshot?.windows.find((window) => window.name === "weekly") ||
    emptyWindow("weekly", "每周");
  return [fiveHour, weekly];
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
  const planLabel = snapshot?.planLabel || snapshot?.planType || "Kimi Code";
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

  if (isSmall)
    return (
      <DualQuotaSmallView
        width={width}
        provider="kimi"
        planLabel={planLabel}
        watermarkPath="assets/watermark-kimi.png"
        first={smallWindow(first)}
        second={smallWindow(second)}
        fetchedText={fetchedText}
      />
    );
  return (
    <DualQuotaMediumView
      width={width}
      provider="kimi"
      planLabel={planLabel}
      watermarkPath="assets/watermark-kimi.png"
      fetchedText={fetchedText}
      first={mediumWindow(first)}
      second={mediumWindow(second)}
      errorText={errorText}
    />
  );
}
