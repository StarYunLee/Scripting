import { Widget } from "scripting";
import {
  DualQuotaMediumView,
  SingleQuotaMediumView,
} from "../MediumQuotaViews";
import { DualQuotaSmallView, SingleQuotaSmallView } from "../SmallQuotaViews";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/codex/format";
import type {
  DualQuotaPreset,
  FocusWindow,
  LimitWindow,
  UsageResult,
  UsageSnapshot,
  WidgetStyle,
} from "../../providers/antigravity/types";
import {
  antigravityWindowTitle,
  type AntigravityWindowKey,
} from "../../providers/antigravity/window-titles";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow: FocusWindow;
  widgetStyle: WidgetStyle;
  dualQuotaPreset: DualQuotaPreset;
};

type Model = {
  snapshot: UsageSnapshot | null;
  geminiFiveHour: LimitWindow | null;
  geminiWeekly: LimitWindow | null;
  thirdPartyFiveHour: LimitWindow | null;
  thirdPartyWeekly: LimitWindow | null;
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  return {
    snapshot,
    geminiFiveHour:
      snapshot?.windows.find((window) => window.id.includes("gemini_5h")) ||
      null,
    geminiWeekly:
      snapshot?.windows.find((window) => window.id.includes("gemini_weekly")) ||
      null,
    thirdPartyFiveHour:
      snapshot?.windows.find((window) => window.id.includes("3p_5h")) || null,
    thirdPartyWeekly:
      snapshot?.windows.find((window) => window.id.includes("3p_weekly")) ||
      null,
    planLabel: snapshot?.planLabel || snapshot?.planType || "Antigravity",
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
function shownPercent(window: LimitWindow | null): string {
  return formatPercent(window?.remainingPercent);
}
function singleWindowKey(focus: FocusWindow): AntigravityWindowKey {
  return focus === "gemini_weekly" ? "gemini_weekly" : "third_party_weekly";
}

function pickFocusWindow(model: Model, focus: FocusWindow): LimitWindow | null {
  return focus === "gemini_weekly"
    ? model.geminiWeekly
    : model.thirdPartyWeekly;
}
function SingleWindowView({
  model,
  family,
  focusWindow,
}: {
  model: Model;
  family: string;
  focusWindow: FocusWindow;
}) {
  const small = isSmall(family);
  const width = displayWidth(family);
  const focus = pickFocusWindow(model, focusWindow);
  const shown = focus?.remainingPercent;
  const title = antigravityWindowTitle(
    singleWindowKey(focusWindow),
    small ? "compact" : "standard",
  );

  if (small)
    return (
      <SingleQuotaSmallView
        width={width}
        provider="antigravity"
        planLabel={model.planLabel}
        watermarkPath="assets/watermark-antigravity.png"
        title={title}
        usedPercent={focus?.usedPercent}
        remainingPercent={focus?.remainingPercent}
        usedText={formatPercent(focus?.usedPercent)}
        remainingText={formatPercent(focus?.remainingPercent)}
        fetchedText={formatSmallDate(model.snapshot?.fetchedAt)}
        resetText={formatSmallDate(focus?.resetAt)}
        optionalMeta={null}
      />
    );

  return (
    <SingleQuotaMediumView
      width={width}
      provider="antigravity"
      planLabel={model.planLabel}
      watermarkPath="assets/watermark-antigravity.png"
      title={title}
      usedPercent={focus?.usedPercent}
      remainingPercent={focus?.remainingPercent}
      usedText={formatPercent(focus?.usedPercent)}
      remainingText={formatPercent(shown)}
      fetchedText={model.fetched}
      resetText={formatResetDate(focus?.resetAt)}
      optionalMeta={null}
      errorText={!model.live && model.detail ? model.detail : undefined}
    />
  );
}

export function UsageWidgetView({
  result,
  family,
  focusWindow,
  widgetStyle,
  dualQuotaPreset,
}: Props) {
  const model = modelFor(result);
  if (widgetStyle === "single")
    return (
      <SingleWindowView
        model={model}
        family={family}
        focusWindow={focusWindow}
      />
    );
  let firstWindow: LimitWindow | null;
  let secondWindow: LimitWindow | null;
  let firstKey: AntigravityWindowKey;
  let secondKey: AntigravityWindowKey;
  if (dualQuotaPreset === "third_party_five_hour_weekly") {
    firstWindow = model.thirdPartyFiveHour;
    secondWindow = model.thirdPartyWeekly;
    firstKey = "third_party_five_hour";
    secondKey = "third_party_weekly";
  } else if (dualQuotaPreset === "weekly_both") {
    firstWindow = model.geminiWeekly;
    secondWindow = model.thirdPartyWeekly;
    firstKey = "gemini_weekly";
    secondKey = "third_party_weekly";
  } else {
    firstWindow = model.geminiFiveHour;
    secondWindow = model.geminiWeekly;
    firstKey = "gemini_five_hour";
    secondKey = "gemini_weekly";
  }
  const small = isSmall(family);
  const titleMode = small ? "compact" : "standard";
  const firstTitle = antigravityWindowTitle(firstKey, titleMode);
  const secondTitle = antigravityWindowTitle(secondKey, titleMode);
  const width = displayWidth(family);

  if (small)
    return (
      <DualQuotaSmallView
        width={width}
        provider="antigravity"
        planLabel={model.planLabel}
        watermarkPath="assets/watermark-antigravity.png"
        first={{
          title: firstTitle,
          usedPercent: firstWindow?.usedPercent,
          remainingPercent: firstWindow?.remainingPercent,
          remainingText: shownPercent(firstWindow),
          resetText: formatResetDate(firstWindow?.resetAt),
        }}
        second={{
          title: secondTitle,
          usedPercent: secondWindow?.usedPercent,
          remainingPercent: secondWindow?.remainingPercent,
          remainingText: shownPercent(secondWindow),
          resetText: formatResetDate(secondWindow?.resetAt),
        }}
        fetchedText={model.fetched}
      />
    );

  return (
    <DualQuotaMediumView
      width={width}
      provider="antigravity"
      planLabel={model.planLabel}
      watermarkPath="assets/watermark-antigravity.png"
      fetchedText={model.fetched}
      first={{
        title: firstTitle,
        usedPercent: firstWindow?.usedPercent,
        remainingPercent: firstWindow?.remainingPercent,
        usedText: formatPercent(firstWindow?.usedPercent),
        remainingText: shownPercent(firstWindow),
        resetText: formatResetDate(firstWindow?.resetAt),
      }}
      second={{
        title: secondTitle,
        usedPercent: secondWindow?.usedPercent,
        remainingPercent: secondWindow?.remainingPercent,
        usedText: formatPercent(secondWindow?.usedPercent),
        remainingText: shownPercent(secondWindow),
        resetText: formatResetDate(secondWindow?.resetAt),
      }}
      errorText={!model.live && model.detail ? model.detail : undefined}
    />
  );
}
