import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveAntigravityBadge(label: string): PlanBadgeRecipe {
  return {
    text:
      label
        .replace(/^Antigravity\s+/i, "")
        .trim()
        .toUpperCase() || "ANTIGRAVITY",
    background: linear(["#475569", "#2563EB"], ["#64748B", "#3B82F6"]),
    foreground: "#FFFFFF",
    preserveLogoColor: true,
  };
}
