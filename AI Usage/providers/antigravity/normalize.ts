import type { NormalizedUsageSnapshot } from "../../services/usage-model";
import type { LimitWindow, UsageSnapshot } from "./types";
import { displayAntigravityPlanLabel } from "./plan-label";
import { quotaIdentity, quotaPeriod, quotaWindowTitle, sortQuotaWindows } from "./window-titles";

/** Reject old model-derived entries, including when read directly by a widget's snapshot registry. */
export function quotaSummaryWindows(windows: readonly LimitWindow[]): LimitWindow[] {
  if (!Array.isArray(windows)) return [];
  const valid = windows.filter((window): window is LimitWindow => {
    if (!window || window.source !== "quota_summary" || typeof window.id !== "string" || !window.id.trim()) return false;
    if (typeof window.label !== "string" || !window.label.trim()) return false;
    const percent = window.remainingPercent ?? window.usedPercent;
    return (typeof percent === "number" && Number.isFinite(percent)) ||
      (typeof window.resetAt === "string" && Number.isFinite(Date.parse(window.resetAt)));
  });
  return sortQuotaWindows(valid.map(window => {
    const quota = quotaIdentity(window);
    if (!quota) return { ...window }; // No raw identity in an old cache: preserve it until a real refresh.
    const period = quotaPeriod(quota.window, quota.bucketId);
    return { ...window, quota, label: quotaWindowTitle(quota), windowSeconds: period.seconds,
      name: period.seconds === 18000 ? "five_hour" as const : period.seconds === 604800 ? "weekly" as const : "unknown" as const };
  }));
}

export function normalizeUsageSnapshot(snapshot: UsageSnapshot): NormalizedUsageSnapshot {
  return {
    planLabel: displayAntigravityPlanLabel(snapshot.planLabel) || displayAntigravityPlanLabel(snapshot.planType),
    windows: quotaSummaryWindows(snapshot.windows),
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
