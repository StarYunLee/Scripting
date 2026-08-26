import type { DualQuotaPreset, FocusWindow, WidgetSettings, WidgetStyle } from "./types"

const SETTINGS_KEY = "claude_usage_settings"
const PROFILE_SETTINGS_KEY = "claude_usage_profile_settings_v1"

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

type ProfileWidgetSettings = Pick<WidgetSettings, "displayMode" | "focusWindow" | "widgetStyle" | "dualQuotaPreset">
type ProfileSettingsRegistry = { profiles: Record<string, ProfileWidgetSettings> }

function isObject(v: unknown): v is Record<string, unknown> { return Boolean(v) && typeof v === "object" && !Array.isArray(v) }
function isFocus(v: unknown): v is FocusWindow { return v === "five_hour" || v === "weekly" || v === "weekly_fable" }
function isWidgetStyle(v: unknown): v is WidgetStyle { return v === "dual" || v === "single" }
function isDualQuotaPreset(v: unknown): v is DualQuotaPreset { return v === "five_hour_weekly" || v === "weekly_fable" }
function sanitizeDisplaySettings(value: unknown, fallback: ProfileWidgetSettings): ProfileWidgetSettings {
  const object = isObject(value) ? value : {}
  return {
    displayMode: object.displayMode === "remaining" ? "remaining" : object.displayMode === "used" ? "used" : fallback.displayMode,
    focusWindow: isFocus(object.focusWindow) ? object.focusWindow : fallback.focusWindow,
    widgetStyle: isWidgetStyle(object.widgetStyle) ? object.widgetStyle : fallback.widgetStyle,
    dualQuotaPreset: isDualQuotaPreset(object.dualQuotaPreset) ? object.dualQuotaPreset : fallback.dualQuotaPreset,
  }
}
function readProfileRegistry(): ProfileSettingsRegistry {
  try {
    const value = Storage.get<unknown>(PROFILE_SETTINGS_KEY)
    if (!isObject(value) || !isObject(value.profiles)) return { profiles: {} }
    const profiles: Record<string, ProfileWidgetSettings> = {}
    const fallback = sanitizeDisplaySettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)
    for (const [profileId, settings] of Object.entries(value.profiles)) {
      if (!profileId.trim() || !isObject(settings)) continue
      profiles[profileId] = sanitizeDisplaySettings(settings, fallback)
    }
    return { profiles }
  } catch { return { profiles: {} } }
}
function writeProfileRegistry(value: ProfileSettingsRegistry): void {
  try { Storage.set(PROFILE_SETTINGS_KEY, value) } catch { /* ignore */ }
}

export function getSettings(): WidgetSettings {
  try {
    const value = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY)
    if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS }
    const display = sanitizeDisplaySettings(value, DEFAULT_SETTINGS)
    return {
      ...display,
      reloadMinutes: typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5 ? Math.min(value.reloadMinutes, 360) : DEFAULT_SETTINGS.reloadMinutes,
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function getEffectiveSettings(profileId?: string | null): WidgetSettings {
  const global = getSettings()
  if (!profileId) return global
  const profile = readProfileRegistry().profiles[profileId]
  return profile ? { ...global, ...profile, reloadMinutes: global.reloadMinutes } : global
}

export function setProfileSettings(profileId: string, patch: Partial<ProfileWidgetSettings>): WidgetSettings {
  if (!profileId) return getSettings()
  const current = getEffectiveSettings(profileId)
  const next = sanitizeDisplaySettings({ ...current, ...patch }, current)
  const registry = readProfileRegistry()
  registry.profiles[profileId] = next
  writeProfileRegistry(registry)
  return { ...getSettings(), ...next, reloadMinutes: getSettings().reloadMinutes }
}

export function clearProfileSettings(profileId: string): WidgetSettings {
  if (!profileId) return getSettings()
  const registry = readProfileRegistry()
  if (profileId in registry.profiles) {
    delete registry.profiles[profileId]
    writeProfileRegistry(registry)
  }
  return getSettings()
}

export function hasProfileSettings(profileId?: string | null): boolean {
  return Boolean(profileId && readProfileRegistry().profiles[profileId])
}

export function setReloadMinutes(reloadMinutes: number): WidgetSettings {
  const current = getSettings()
  const next = {
    ...current,
    reloadMinutes: Number.isFinite(reloadMinutes) && reloadMinutes >= 5 ? Math.min(reloadMinutes, 360) : current.reloadMinutes,
  }
  try { Storage.set(SETTINGS_KEY, next) } catch { /* ignore */ }
  return next
}
