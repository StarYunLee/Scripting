import type { PlanBadgeRecipe } from "../badge-contract";
import { linear, normalizePlan } from "../badge-contract";

export function resolveGrokBadge(label: string): PlanBadgeRecipe {
  const normalized = normalizePlan(label);
  if (
    normalized === "supergrok-heavy" ||
    normalized === "supergrokheavy" ||
    normalized === "heavy"
  )
    return {
      text: "SUPERGROK HEAVY",
      background: linear(
        ["#000000", "#064E3B", "#0F766E"],
        ["#000000", "#065F46", "#0D9488"],
      ),
      foreground: "#ECFDF5",
    };
  if (normalized === "supergrok")
    return {
      text: "SUPERGROK",
      background: linear(["#171717", "#047857"], ["#262626", "#059669"]),
      foreground: "#ECFDF5",
    };
  return {
    text: label.trim().toUpperCase() || "GROK",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  };
}
