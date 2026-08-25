import type { Color } from "scripting";

export type UsageSeverity = "normal" | "warning" | "critical";

const WARNING_THRESHOLD = 60;
const CRITICAL_THRESHOLD = 85;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function resolveUsedPercent(
  usedPercent: number | null | undefined,
  remainingPercent?: number | null,
): number | null {
  if (usedPercent != null && Number.isFinite(usedPercent)) {
    return clampPercent(usedPercent);
  }
  if (remainingPercent != null && Number.isFinite(remainingPercent)) {
    return clampPercent(100 - remainingPercent);
  }
  return null;
}

export function usageSeverity(
  usedPercent: number | null | undefined,
  remainingPercent?: number | null,
): UsageSeverity | null {
  const used = resolveUsedPercent(usedPercent, remainingPercent);
  if (used == null) return null;
  if (used >= CRITICAL_THRESHOLD) return "critical";
  if (used >= WARNING_THRESHOLD) return "warning";
  return "normal";
}

export function usageTint(
  usedPercent: number | null | undefined,
  remainingPercent?: number | null,
): Color {
  switch (usageSeverity(usedPercent, remainingPercent)) {
    case "critical":
      return "systemRed";
    case "warning":
      return "systemOrange";
    default:
      return "systemGreen";
  }
}
