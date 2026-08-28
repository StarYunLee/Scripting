export type WidgetWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
};

export type WidgetPresentation = "empty" | "single" | "dual" | "multi";

export function selectWidgetWindows<TWindow extends WidgetWindow>(
  windows: TWindow[],
  hiddenWindowIds: string[],
  maxVisible = 4,
): TWindow[] {
  const hidden = new Set(hiddenWindowIds);
  return windows
    .filter((window) => !hidden.has(window.id))
    .slice(0, Math.max(0, maxVisible));
}

export function widgetPresentation(rowCount: number): WidgetPresentation {
  if (rowCount <= 0) return "empty";
  if (rowCount === 1) return "single";
  if (rowCount === 2) return "dual";
  return "multi";
}

export type WidgetMultiLayout = {
  contentSpacing: number;
  rowSpacing: number;
  titleFont: number;
  valueFont: number;
  trackHeight: number;
};

export function widgetMultiLayout(
  family: string,
  rowCount: number,
): WidgetMultiLayout {
  const value = family.toLowerCase();
  const small = value.includes("small") && !value.includes("medium");
  if (small && rowCount >= 4) {
    return {
      contentSpacing: 3,
      rowSpacing: 0,
      titleFont: 9,
      valueFont: 9,
      trackHeight: 3,
    };
  }
  if (small) {
    return {
      contentSpacing: 5,
      rowSpacing: 1,
      titleFont: 10,
      valueFont: 10,
      trackHeight: 4,
    };
  }
  return {
    contentSpacing: 4,
    rowSpacing: 1,
    titleFont: 11,
    valueFont: 11,
    trackHeight: 4,
  };
}

export function remainingPercent(
  remaining: number | null | undefined,
  used: number | null | undefined,
): number | null {
  if (remaining != null) return remaining;
  if (used == null) return null;
  return Math.max(0, Math.min(100, 100 - used));
}
