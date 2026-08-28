import type { PlanBadgeRecipe } from "../badge-contract";
import { linear, normalizePlan } from "../badge-contract";

export function resolveClaudeBadge(label: string): PlanBadgeRecipe {
  const normalized = normalizePlan(label, "claude");
  if (normalized === "max-20x")
    return {
      text: "MAX 20X",
      background: linear(
        ["#F59E0B", "#EA580C", "#E5254F"],
        ["#FBBF24", "#F97316", "#F43F5E"],
      ),
      foreground: "#000000",
    };
  if (normalized === "max-5x")
    return {
      text: "MAX 5X",
      background: linear(
        ["#F97316", "#F59E0B", "#F43F5E"],
        ["#FB923C", "#FBBF24", "#FB7185"],
      ),
      foreground: "#000000",
    };
  if (normalized === "max")
    return {
      text: "MAX",
      background: linear(
        ["#FB923C", "#F59E0B", "#EA580C"],
        ["#FB923C", "#F59E0B", "#F97316"],
      ),
      foreground: "#000000",
    };
  if (normalized === "pro")
    return {
      text: "PRO",
      background: linear(["#FCD34D", "#FACC15", "#F59E0B"]),
      foreground: "#000000",
    };
  if (normalized.startsWith("team"))
    return {
      text: "TEAM",
      background: linear(["#8B5CF6", "#4F46E5"], ["#A78BFA", "#6366F1"]),
      foreground: "#FFFFFF",
    };
  return {
    text:
      label
        .replace(/^Claude\s+/i, "")
        .trim()
        .toUpperCase() || "CLAUDE",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  };
}
