export type WidgetFamilyKind = "small" | "medium" | "large";

export function parseWidgetFamily(family: string): WidgetFamilyKind | null {
  const value = family.toLowerCase();
  if (value.includes("small") && !value.includes("medium")) return "small";
  if (value.includes("large")) return "large";
  if (value.includes("medium")) return "medium";
  return null;
}

/** Dashboard / 入口回退：未知尺寸按 Small。 */
export function widgetFallbackWidth(family: string): number {
  const kind = parseWidgetFamily(family);
  if (kind === "large") return 364;
  if (kind === "medium") return 338;
  return 158;
}

/** 单账号分发器回退：仅 Small 用 158，其余保持 Medium。 */
export function widgetDispatcherFallbackWidth(family: string): number {
  return parseWidgetFamily(family) === "small" ? 158 : 338;
}
