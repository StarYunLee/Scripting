import type { MinimaxRegion } from "./minimax/types";
import type { ZaiRegion } from "./zai/types";

export type ConsoleAuthRegion = MinimaxRegion | ZaiRegion;

export function parseConsoleAuthChoice(
  index: number,
): ConsoleAuthRegion | null {
  if (index === 0) return "intl";
  if (index === 1) return "cn";
  return null;
}
