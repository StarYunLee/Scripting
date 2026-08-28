import { Widget } from "scripting";
import {
  DualQuotaMediumView,
  SingleQuotaMediumView,
} from "../MediumQuotaViews";
import { DualQuotaSmallView, SingleQuotaSmallView } from "../SmallQuotaViews";
import { pickFocusWindow } from "../../providers/claude/api";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/claude/format";
import type {
  DualQuotaPreset,
  FocusWindow,
  LimitWindow,
  UsageResult,
  UsageSnapshot,
  WidgetStyle,
} from "../../providers/claude/types";
import { claudeWindowTitle } from "../../providers/claude/window-titles";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow: FocusWindow;
  widgetStyle: WidgetStyle;
  dualQuotaPreset: DualQuotaPreset;
};

type Model = {
  snapshot: UsageSnapshot | null;
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  weeklyFable: LimitWindow | null;
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  return {
    snapshot,
    fiveHour:
      snapshot?.fiveHour ||
      snapshot?.windows.find((w) => w.name === "five_hour") ||
      null,
    weekly:
      snapshot?.weekly ||
      snapshot?.windows.find((w) => w.name === "weekly") ||
      null,
    weeklyFable:
      snapshot?.weeklyFable ||
      snapshot?.windows.find((w) => w.name === "weekly_fable") ||
      null,
    planLabel: snapshot?.planLabel || snapshot?.planType || "Claude",
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
function singleWindowTitle(focus: FocusWindow, compact = false): string {
  return claudeWindowTitle(focus, compact ? "compact" : "standard");
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
  const focus = model.snapshot
    ? pickFocusWindow(model.snapshot, focusWindow)
    : null;
  const shown = focus?.remainingPercent;
  const title = singleWindowTitle(focusWindow, small);

  if (small)
    return (
      <SingleQuotaSmallView
        width={width}
        provider="claude"
        planLabel={model.planLabel}
        watermarkPath="assets/watermark-claude.png"
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
      provider="claude"
      planLabel={model.planLabel}
      watermarkPath="assets/watermark-claude.png"
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
  const firstWindow =
    dualQuotaPreset === "weekly_fable" ? model.weekly : model.fiveHour;
  const secondWindow =
    dualQuotaPreset === "weekly_fable" ? model.weeklyFable : model.weekly;
  const small = isSmall(family);
  const titleMode = small ? "compact" : "standard";
  const firstTitle =
    dualQuotaPreset === "weekly_fable"
      ? claudeWindowTitle("weekly", titleMode)
      : claudeWindowTitle("five_hour", titleMode);
  const secondTitle =
    dualQuotaPreset === "weekly_fable"
      ? claudeWindowTitle("weekly_fable", titleMode)
      : claudeWindowTitle("weekly", titleMode);
  const width = displayWidth(family);

  if (small)
    return (
      <DualQuotaSmallView
        width={width}
        provider="claude"
        planLabel={model.planLabel}
        watermarkPath="assets/watermark-claude.png"
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
      provider="claude"
      planLabel={model.planLabel}
      watermarkPath="assets/watermark-claude.png"
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
