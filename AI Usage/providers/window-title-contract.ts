export type WindowTitle = {
  standard: string;
  compact?: string;
};

export type WindowTitleMode = "standard" | "compact";

export function resolveWindowTitle(
  title: WindowTitle,
  mode: WindowTitleMode = "standard",
): string {
  return mode === "compact" ? title.compact || title.standard : title.standard;
}
