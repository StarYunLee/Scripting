import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveMinimaxBadge(label: string): PlanBadgeRecipe {
  return {
    text:
      label
        .replace(/\s*[·•]\s*(国内站|国际站)$/i, "")
        .trim()
        .toUpperCase() || "MINIMAX",
    background: linear(["#9A3412", "#E85D04", "#F97316"]),
    foreground: "#FFFFFF",
  };
}
