/**
 * Shared layout metrics for the native theme.
 *
 * These values are deliberately theme-neutral: the glass theme can reuse the
 * same page frame and typography, adding only the small surface compensations
 * listed at the bottom.
 */
export const UI_METRICS = {
  pageHorizontalInset: 16,
  pageTopInset: 8,
  pageBottomInset: 16,
  sectionSpacing: 12,

  settingsRowMinHeight: 44,
  settingsDetailFont: "subheadline" as const,
  /** Extra vertical padding the glass row skin needs because it has no List row insets. */
  glassRowVerticalPadding: 8,

  reviewSectionCornerClearance: 12,
  reviewDateColumnWidth: 42,
  reviewCardRadius: 16,
  reviewCardPaddingHorizontal: 12,
  reviewCardPaddingVertical: 10,
  reviewRowBottomSpacing: 16,
  reviewRowSameDaySpacing: 10,
} as const;
