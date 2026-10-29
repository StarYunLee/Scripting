import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

export function resolveWorkbuddyBadge(label: string): PlanBadgeRecipe {
  const intl = /国际/.test(label);
  return {
    text: label.trim() || "WorkBuddy",
    background: intl
      ? linear(["#0B1F3A", "#124888", "#2563EB"])
      : linear(["#0B3B36", "#0F766E", "#10B981"]),
    foreground: "#FFFFFF",
    preserveLogoColor: true,
  };
}
