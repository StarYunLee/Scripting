import type { UsageSnapshot } from "./types";
import { codexWindowTitle } from "./window-titles";
import {
  isUsageWindowView,
  normalizeResetCredits,
  toUsageWindowView,
  type NormalizedUsageSnapshot,
} from "../../services/usage-model";

function isOrdinaryWindow(window: { id: string }): boolean {
  return window.id.startsWith("codex:") || window.id.startsWith("direct:");
}

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
          isOrdinaryWindow(window) && window.name !== "unknown"
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
