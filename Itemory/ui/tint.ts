import type { Color } from "scripting";

/**
 * Build a low-opacity tint for status/category capsules.
 *
 * Keeps the flat native pill shape while retaining Itemory's semantic colors.
 * Named colors fall back to the app accent tint.
 */
export function tintedFill(color: string, alpha: number): Color {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return `rgba(0, 122, 255, ${alpha})` as Color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(0, 122, 255, ${alpha})` as Color;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})` as Color;
}
