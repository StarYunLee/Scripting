import type { MinimaxRegion } from "./types";

export function parseMinimaxAuthChoice(index: number): MinimaxRegion | null {
  if (index === 0) return "intl";
  if (index === 1) return "cn";
  return null;
}
