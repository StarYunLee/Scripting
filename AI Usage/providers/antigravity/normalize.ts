import type { NormalizedUsageSnapshot } from "../../services/usage-model";
import type { UsageSnapshot } from "./types";
import {
  antigravityWindowTitle,
  type AntigravityWindowKey,
} from "./window-titles";

export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  const keyFor = (id: string): AntigravityWindowKey | null => {
    const value = id.toLowerCase();
    if (value.includes("gemini_5h")) return "gemini_five_hour";
    if (value.includes("gemini_weekly")) return "gemini_weekly";
    if (value.includes("3p_5h")) return "third_party_five_hour";
    if (value.includes("3p_weekly")) return "third_party_weekly";
    return null;
  };
  return {
    planLabel: snapshot.planLabel || snapshot.planType || null,
    windows: snapshot.windows.map((window) => {
      const key = keyFor(window.id);
      return key ? { ...window, label: antigravityWindowTitle(key) } : window;
    }),
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
