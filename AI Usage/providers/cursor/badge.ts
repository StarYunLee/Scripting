import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveCursorBadge(label: string): PlanBadgeRecipe {
  return {
    text:
      label
        .trim()
        .replace(/^Cursor\s+/i, "")
        .toUpperCase() || "CURSOR",
    background: linear(["#111827", "#374151"], ["#111827", "#4B5563"]),
    foreground: "#FFFFFF",
  };
}
