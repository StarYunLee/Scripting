import type { UsageSnapshot } from "./types";
import { isOrdinaryCodexWindow } from "./usage-parser";
import { codexWindowTitle } from "./window-titles";
import {
  isUsageWindowView,
  normalizeResetCredits,
  toUsageWindowView,
  type NormalizedUsageSnapshot,
} from "../../services/usage-model";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  const resetCredits = normalizeResetCredits(
    snapshot.resetCreditsAvailable,
    snapshot.resetCreditExpirations,
  );
  return {
    planLabel: snapshot.planLabel || snapshot.planType || null,
    windows: snapshot.windows
      .map((window) => ({
        ...window,
        label:
          isOrdinaryCodexWindow(window) && window.name !== "unknown"
            ? codexWindowTitle(window.name)
            : window.label,
      }))
      .map(toUsageWindowView)
      .filter(isUsageWindowView),
    resetCredits,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
