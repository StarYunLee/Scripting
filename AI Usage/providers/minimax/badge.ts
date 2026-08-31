import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";
import { stripRegionSuffixes } from "./format";

export function resolveMinimaxBadge(label: string): PlanBadgeRecipe {
  return {
    text: stripRegionSuffixes(label).toUpperCase() || "MINIMAX",
    background: linear(["#9A3412", "#E85D04", "#F97316"]),
    foreground: "#FFFFFF",
  };
}
