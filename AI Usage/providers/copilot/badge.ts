import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveCopilotBadge(label: string): PlanBadgeRecipe {
  return {
    text: label.trim().replace(/^GitHub\s+Copilot\s*/i, "").toUpperCase() || "COPILOT",
    background: linear(["#24292F", "#8250DF"], ["#24292F", "#A371F7"]),
    foreground: "#FFFFFF",
  };
}
