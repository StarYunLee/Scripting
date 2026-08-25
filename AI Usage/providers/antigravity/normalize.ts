import type { NormalizedUsageSnapshot } from "../../services/usage-model";
import type { UsageSnapshot } from "./types";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  return {
    planLabel: snapshot.planLabel || snapshot.planType || null,
    windows: snapshot.windows,
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
