import {
  isUsageWindowView,
  toUsageWindowView,
  type NormalizedUsageSnapshot,
} from "../../services/usage-model";
import type { UsageSnapshot } from "./types";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  return {
    planLabel: snapshot.planLabel,
    windows: snapshot.windows
      .map(toUsageWindowView)
      .filter(isUsageWindowView),
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
