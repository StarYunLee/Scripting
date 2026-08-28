import { Widget } from "scripting";
import {
  formatFetchedAt,
  formatPercent,
  formatSmallDate,
} from "../../providers/copilot/format";
import type { LimitWindow, UsageResult } from "../../providers/copilot/types";
import { DualQuotaSmallView } from "../SmallQuotaViews";
import { DualQuotaMediumView } from "../MediumQuotaViews";

type Props = { result: UsageResult; family: string };

function emptyWindow(
  name: "credits" | "chat" | "completions",
  label: string,
): LimitWindow {
  return {
    id: `copilot:empty:${name}`,
    name,
    label,
    usedPercent: null,
    remainingPercent: null,
    resetAt: null,
    resetAtMs: null,
    windowSeconds: 30 * 86400,
  };
}

function coreWindows(result: UsageResult): [LimitWindow, LimitWindow] {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const first =
    snapshot?.credits ||
    snapshot?.windows.find((window) => window.name === "credits") ||
    emptyWindow("credits", "高级请求");
  const second =
    snapshot?.chat ||
    snapshot?.windows.find((window) => window.name === "chat") ||
    snapshot?.completions ||
    snapshot?.windows.find((window) => window.name === "completions") ||
    emptyWindow("completions", "代码补全");
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
  const planLabel =
    snapshot?.planLabel || snapshot?.planType || "GitHub Copilot";
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
        provider="copilot"
        planLabel={planLabel}
        watermarkPath="assets/watermark-copilot.png"
        first={smallWindow(first)}
        second={smallWindow(second)}
        fetchedText={fetchedText}
      />
    );
  return (
    <DualQuotaMediumView
      width={width}
      provider="copilot"
      planLabel={planLabel}
      watermarkPath="assets/watermark-copilot.png"
      fetchedText={fetchedText}
      first={mediumWindow(first)}
      second={mediumWindow(second)}
      errorText={errorText}
    />
  );
}
