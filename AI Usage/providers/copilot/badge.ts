import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveCopilotBadge(label: string): PlanBadgeRecipe {
  return {
    text:
      label
        .trim()
        .replace(/^GitHub\s+Copilot\s+/i, "")
        .toUpperCase() || "COPILOT",
    background: linear(["#111827", "#374151"], ["#111827", "#4B5563"]),
    foreground: "#FFFFFF",
  };
}
