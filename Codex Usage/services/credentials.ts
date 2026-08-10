import type { FocusWindow, MediumWidgetLayout, WidgetLayout, WidgetSettings } from "./types"

const SETTINGS_KEY = "codex_usage_settings"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}

const DEFAULT_SETTINGS: WidgetSettings = {
  displayMode: "used",
  focusWindow: "weekly",
  reloadMinutes: 30,
  widgetLayout: "detail",
}

/** 当前单窗口 Medium 布局基线；后续新增布局时应拆成独立视图，不再读取隐藏调试设置。 */
export const MEDIUM_LAYOUT: MediumWidgetLayout = {
  left: 20, right: 20, topY: 10, topFont: 10,
  chipFont: 12, chipHorizontal: 10, chipVertical: 6,
  titleY: 35, titleFont: 17, mainY: 56, mainFont: 40, suffixFont: 12,
  progressY: 110, progressHeight: 7, footerY: 122,
  footerIcon: 10, footerLabelFont: 10, footerValueFont: 12, dividerHeight: 32,
  planY: 9, planFont: 10, planHorizontal: 10, planVertical: 4,
  subscriptionBadgeFont: 9, resetCountFont: 10,
  watermarkSize: 135, watermarkRight: -8, watermarkBottom: -12,
}

function isFocus(value: unknown): value is FocusWindow {
  return value === "five_hour" || value === "weekly" || value === "monthly"
}
function isWidgetLayout(value: unknown): value is WidgetLayout {
  return value === "detail" || value === "overview"
}

export function getSettings(): WidgetSettings {
  try {
    const value = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY)
    if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS }
    return {
      displayMode: value.displayMode === "remaining" ? "remaining" : "used",
      focusWindow: isFocus(value.focusWindow) ? value.focusWindow : DEFAULT_SETTINGS.focusWindow,
      reloadMinutes: typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
        ? Math.min(value.reloadMinutes, 360)
        : DEFAULT_SETTINGS.reloadMinutes,
      widgetLayout: isWidgetLayout(value.widgetLayout) ? value.widgetLayout : DEFAULT_SETTINGS.widgetLayout,
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function setSettings(patch: Partial<WidgetSettings>): WidgetSettings {
  const next = { ...getSettings(), ...patch }
  try { Storage.set(SETTINGS_KEY, next) } catch { /* ignore */ }
  return next
}
