import { Widget } from "scripting";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
  resetCreditsSummary,
} from "../../providers/grok/format";
import { SingleQuotaMediumView } from "../MediumQuotaViews";
import { SingleQuotaSmallView } from "../SmallQuotaViews";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/grok/types";
import { grokWindowTitle } from "../../providers/grok/window-titles";

type Props = {
  result: UsageResult;
  family: string;
};
type Model = {
  snapshot: UsageSnapshot | null;
  focus: LimitWindow | null;
  progress: number | null;
  main: string;
  suffix: string;
  fetched: string;
  planLabel: string;
  resetLabel: string;
  resetExpiration: string;
  resetExpirationAt: string | null;
  live: boolean;
  detail: string;
  hasResetCredits: boolean;
};
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const focus =
    snapshot?.weekly ||
    snapshot?.windows.find((window) => window.name === "weekly") ||
    null;
  const remaining =
    focus?.remainingPercent ??
    (focus?.usedPercent == null ? null : 100 - focus.usedPercent);
  const resets = resetCreditsSummary(
    snapshot?.resetCreditsAvailable,
    snapshot?.resetCreditExpirations,
  );
  return {
    snapshot,
    focus,
    progress: remaining,
    main: formatPercent(remaining),
    suffix: "剩余",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    resetLabel:
      resets.available == null ? "重置 —" : `重置 ${resets.available} 次`,
    resetExpiration: formatResetDate(resets.nearestExpiration),
    resetExpirationAt: resets.nearestExpiration,
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
    hasResetCredits: snapshot?.resetCreditsAvailable != null,
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
function focusTitle(compact = false): string {
  return grokWindowTitle("weekly", compact ? "compact" : "standard");
}

export function WeeklyUsageWidgetView({ result, family }: Props) {
  const model = modelFor(result);
  const small = isSmall(family);

  if (small)
    return (
      <SingleQuotaSmallView
        width={displayWidth(family)}
        provider="grok"
        planLabel={model.planLabel}
        watermarkPath="assets/watermark-grok.png"
        title={focusTitle(true)}
        usedPercent={model.focus?.usedPercent}
        remainingPercent={model.focus?.remainingPercent}
        usedText={formatPercent(model.focus?.usedPercent)}
        remainingText={formatPercent(model.focus?.remainingPercent)}
        fetchedText={formatSmallDate(model.snapshot?.fetchedAt)}
        resetText={formatSmallDate(model.focus?.resetAt)}
        optionalMeta={
          model.hasResetCredits
            ? {
                icon: "arrow.clockwise",
                label: model.resetLabel,
                value: formatSmallDate(model.resetExpirationAt),
              }
            : null
        }
      />
    );

  return (
    <SingleQuotaMediumView
      width={displayWidth(family)}
      provider="grok"
      planLabel={model.planLabel}
      watermarkPath="assets/watermark-grok.png"
      title={focusTitle()}
      usedPercent={model.focus?.usedPercent}
      remainingPercent={model.focus?.remainingPercent}
      usedText={formatPercent(model.focus?.usedPercent)}
      remainingText={model.main}
      fetchedText={model.fetched}
      resetText={formatResetDate(model.focus?.resetAt)}
      optionalMeta={
        model.hasResetCredits
          ? { label: model.resetLabel, value: model.resetExpiration }
          : null
      }
      errorText={!model.live && model.detail ? model.detail : undefined}
    />
  );
}
