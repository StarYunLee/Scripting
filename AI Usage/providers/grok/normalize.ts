import type { UsageSnapshot } from "./types";
import { grokWindowTitle } from "./window-titles";
import {
  isUsageWindowView,
  normalizeResetCredits,
  toUsageWindowView,
  type NormalizedUsageSnapshot,
} from "../../services/usage-model";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  return {
    planLabel: snapshot.planLabel || snapshot.planType || null,
    windows: snapshot.windows
      .filter(
        (window) => window.name === "weekly" || window.name === "weekly_build",
      )
      .map((window) => ({
        ...window,
        label: grokWindowTitle(window.name),
      }))
      .map(toUsageWindowView)
      .filter(isUsageWindowView),
    resetCredits: normalizeResetCredits(
      snapshot.resetCreditsAvailable,
      snapshot.resetCreditExpirations,
    ),
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
