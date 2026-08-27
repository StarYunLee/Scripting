import type { PlanBadgeRecipe } from "../badge-contract";
import { linear, normalizePlan } from "../badge-contract";

export function resolveZaiBadge(label: string): PlanBadgeRecipe {
  const normalized = normalizePlan(label);
  if (normalized === "max" || normalized === "ultra") {
    return {
      text: normalized.toUpperCase(),
      background: linear(["#042F2E", "#0F766E", "#14B8A6"]),
      foreground: "#F0FDFA",
    };
  }
  if (normalized === "pro" || normalized === "pro+") {
    return {
      text: normalized === "pro+" ? "PRO+" : "PRO",
      background: linear(["#134E4A", "#0EA5A8", "#14B8A6"]),
      foreground: "#F0FDFA",
    };
  }
  if (normalized === "lite") {
    return {
      text: "LITE",
      background: linear(["#155E75", "#0891B2", "#22D3EE"]),
      foreground: "#ECFEFF",
    };
  }
  return {
    text: label.trim().toUpperCase() || "Z.AI",
    background: linear(["#042F2E", "#0F766E", "#0EA5A8"]),
    foreground: "#F0FDFA",
  };
}
