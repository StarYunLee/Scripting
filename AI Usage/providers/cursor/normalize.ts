import type { UsageSnapshot } from "./types";
import {
  isUsageWindowView,
  toUsageWindowView,
  type NormalizedUsageSnapshot,
} from "../../services/usage-model";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  return {
    planLabel: snapshot.planLabel || snapshot.planType || null,
    windows: snapshot.windows.map(toUsageWindowView).filter(isUsageWindowView),
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
