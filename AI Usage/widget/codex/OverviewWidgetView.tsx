import { Widget } from "scripting";
import {
  formatPercent,
  formatResetDate,
  resetCreditsSummary,
} from "../../providers/codex/format";
import { DualQuotaMediumView } from "../MediumQuotaViews";
import { DualQuotaSmallView } from "../SmallQuotaViews";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/codex/types";
import { codexWindowTitle } from "../../providers/codex/window-titles";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow: "weekly" | "five_hour" | "monthly";
};

type Model = {
  snapshot: UsageSnapshot | null;
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planLabel: string;
  resetLabel: string;
  resetExpiration: string;
  fetched: string;
  live: boolean;
  detail: string;
  hasResetCredits: boolean;
  additionalText: string | null;
};
function isOrdinaryWindow(window: { id: string }): boolean {
  return window.id.startsWith("codex:") || window.id.startsWith("direct:");
}
function additionalQuotaText(snapshot: UsageSnapshot | null): string | null {
  const windows = snapshot?.windows.filter((window) => !isOrdinaryWindow(window));
  if (!windows?.length) return null;
  return windows
    .map(
      (window) =>
        `${window.label} · 剩余 ${formatPercent(window.remainingPercent)}`,
    )
    .join(" / ");
}
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const resets = resetCreditsSummary(
    snapshot?.resetCreditsAvailable,
    snapshot?.resetCreditExpirations,
  );
  return {
    snapshot,
    fiveHour:
      snapshot?.fiveHour && isOrdinaryWindow(snapshot.fiveHour)
        ? snapshot.fiveHour
        : snapshot?.windows.find(
            (window) =>
              isOrdinaryWindow(window) && window.name === "five_hour",
          ) || null,
    weekly:
      snapshot?.weekly && isOrdinaryWindow(snapshot.weekly)
        ? snapshot.weekly
        : snapshot?.windows.find(
            (window) =>
              isOrdinaryWindow(window) && window.name === "weekly",
          ) || null,
    planLabel: snapshot?.planLabel || snapshot?.planType || "Plus",
    resetLabel:
      resets.available == null ? "重置—" : `重置${resets.available}次`,
    resetExpiration: formatResetDate(resets.nearestExpiration),
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
    hasResetCredits: snapshot?.resetCreditsAvailable != null,
    additionalText: additionalQuotaText(snapshot),
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
export function OverviewWidgetView({ result, family }: Props) {
  const model = modelFor(result);
  const small = isSmall(family);
  const width = displayWidth(family);

  if (small)
    return (
      <DualQuotaSmallView
        width={width}
        provider="codex"
        planLabel={model.planLabel}
        watermarkPath="assets/watermark-chatgpt.png"
        first={{
          title: codexWindowTitle("five_hour", "compact"),
          usedPercent: model.fiveHour?.usedPercent,
          remainingPercent: model.fiveHour?.remainingPercent,
          remainingText: shownPercent(model.fiveHour),
          resetText: formatResetDate(model.fiveHour?.resetAt),
        }}
        second={{
          title: codexWindowTitle("weekly", "compact"),
          usedPercent: model.weekly?.usedPercent,
          remainingPercent: model.weekly?.remainingPercent,
          remainingText: shownPercent(model.weekly),
          resetText: formatResetDate(model.weekly?.resetAt),
        }}
        fetchedText={model.fetched}
        additionalText={model.additionalText || undefined}
      />
    );

  return (
    <DualQuotaMediumView
      width={width}
      provider="codex"
      planLabel={model.planLabel}
      watermarkPath="assets/watermark-chatgpt.png"
      fetchedText={model.fetched}
      first={{
        title: codexWindowTitle("five_hour"),
        usedPercent: model.fiveHour?.usedPercent,
        remainingPercent: model.fiveHour?.remainingPercent,
        usedText: formatPercent(model.fiveHour?.usedPercent),
        remainingText: shownPercent(model.fiveHour),
        resetText: formatResetDate(model.fiveHour?.resetAt),
      }}
      second={{
        title: codexWindowTitle("weekly"),
        usedPercent: model.weekly?.usedPercent,
        remainingPercent: model.weekly?.remainingPercent,
        usedText: formatPercent(model.weekly?.usedPercent),
        remainingText: shownPercent(model.weekly),
        resetText: formatResetDate(model.weekly?.resetAt),
      }}
      secondOptionalMeta={
        model.hasResetCredits
          ? { label: model.resetLabel, value: model.resetExpiration }
          : null
      }
      additionalText={model.additionalText || undefined}
      errorText={!model.live && model.detail ? model.detail : undefined}
    />
  );
}
