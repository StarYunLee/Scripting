import type { UsageSnapshot } from "./types";
import {
  normalizeBasicUsageSnapshot,
  type NormalizedUsageSnapshot,
} from "../../services/usage-model";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  return normalizeBasicUsageSnapshot(snapshot);
}
