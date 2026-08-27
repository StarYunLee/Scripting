import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveKimiBadge(label: string): PlanBadgeRecipe {
  return {
    text:
      label.trim().replace(/^Kimi(?:\s+Code)?\s+/i, "").toUpperCase() || "KIMI",
    background: linear(["#111827", "#4338CA"], ["#111827", "#6366F1"]),
    foreground: "#FFFFFF",
  };
}
