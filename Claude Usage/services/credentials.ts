import type { DualQuotaPreset, FocusWindow, WidgetSettings, WidgetStyle } from "./types"

const SETTINGS_KEY = "claude_usage_settings"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}

const DEFAULT_SETTINGS: WidgetSettings = {
  displayMode: "used",
  focusWindow: "five_hour",
  reloadMinutes: 30,
  widgetStyle: "dual",
  dualQuotaPreset: "five_hour_weekly",
}

function isFocus(v: unknown): v is FocusWindow { return v === "five_hour" || v === "weekly" || v === "weekly_fable" }
function isWidgetStyle(v: unknown): v is WidgetStyle { return v === "dual" || v === "single" }
function isDualQuotaPreset(v: unknown): v is DualQuotaPreset { return v === "five_hour_weekly" || v === "weekly_fable" }

export function getSettings(): WidgetSettings {
  try {
    const value = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY)
    if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS }
    return {
      displayMode: value.displayMode === "remaining" ? "remaining" : "used",
      focusWindow: isFocus(value.focusWindow) ? value.focusWindow : DEFAULT_SETTINGS.focusWindow,
      reloadMinutes: typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5 ? Math.min(value.reloadMinutes, 360) : DEFAULT_SETTINGS.reloadMinutes,
      widgetStyle: isWidgetStyle(value.widgetStyle) ? value.widgetStyle : DEFAULT_SETTINGS.widgetStyle,
      dualQuotaPreset: isDualQuotaPreset(value.dualQuotaPreset) ? value.dualQuotaPreset : DEFAULT_SETTINGS.dualQuotaPreset,
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function setSettings(patch: Partial<WidgetSettings>): WidgetSettings {
  const next = { ...getSettings(), ...patch }
  try { Storage.set(SETTINGS_KEY, next) } catch { /* ignore */ }
  return next
}
