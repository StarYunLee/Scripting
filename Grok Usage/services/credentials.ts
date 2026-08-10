import type { FocusWindow, WidgetLayout, WidgetSettings } from "./types"

const SETTINGS_KEY = "grok_usage_settings"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}

const DEFAULT_SETTINGS: WidgetSettings = {
  displayMode: "used",
  focusWindow: "weekly",
  reloadMinutes: 30,
  widgetLayout: "overview",
}

function isFocus(value: unknown): value is FocusWindow {
  return value === "weekly" || value === "monthly"
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
