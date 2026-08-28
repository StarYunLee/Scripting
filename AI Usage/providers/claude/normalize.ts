import type { UsageSnapshot } from "./types";
import { claudeScopedWindowTitle, claudeWindowTitle } from "./window-titles";
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
    windows: snapshot.windows
      .map((window) => {
        const modelName = window.label.replace(/\s*(?:周限|每周)$/, "").trim();
        const label =
          window.name === "weekly_scoped"
            ? claudeScopedWindowTitle(modelName)
            : claudeWindowTitle(window.name);
        return { ...window, label };
      })
      .map(toUsageWindowView)
      .filter(isUsageWindowView),
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
