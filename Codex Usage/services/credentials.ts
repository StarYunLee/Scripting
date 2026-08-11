import type { FocusWindow, MediumWidgetLayout, WidgetLayout, WidgetSettings } from "./types"

const SETTINGS_KEY = "codex_usage_settings"
const PROFILE_SETTINGS_KEY = "codex_usage_profile_settings_v1"

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

/** Medium 单额度详情布局基线。 */
export const MEDIUM_LAYOUT: MediumWidgetLayout = {
  left: 20, right: 20, topY: 10, topFont: 10,
  chipFont: 12, chipHorizontal: 10, chipVertical: 6,
  titleY: 35, titleFont: 17, mainY: 56, mainFont: 40, suffixFont: 12,
  progressY: 110, progressHeight: 7, footerY: 122,
  footerIcon: 10, footerLabelFont: 10, footerValueFont: 12, dividerHeight: 32,
  planY: 9, planFont: 10, planHorizontal: 10, planVertical: 4,
  resetCountFont: 10,
  watermarkSize: 135, watermarkRight: -8, watermarkBottom: -12,
}

type ProfileWidgetSettings = Pick<WidgetSettings, "displayMode" | "focusWindow" | "widgetLayout">
type ProfileSettingsRegistry = { profiles: Record<string, ProfileWidgetSettings> }

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
function isFocus(value: unknown): value is FocusWindow {
  return value === "five_hour" || value === "weekly" || value === "monthly"
}
function isWidgetLayout(value: unknown): value is WidgetLayout {
  return value === "detail" || value === "overview"
}
function sanitizeDisplaySettings(value: unknown, fallback: ProfileWidgetSettings): ProfileWidgetSettings {
  const object = isObject(value) ? value : {}
  return {
    displayMode: object.displayMode === "remaining" ? "remaining" : object.displayMode === "used" ? "used" : fallback.displayMode,
    focusWindow: isFocus(object.focusWindow) ? object.focusWindow : fallback.focusWindow,
    widgetLayout: isWidgetLayout(object.widgetLayout) ? object.widgetLayout : fallback.widgetLayout,
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
      reloadMinutes: typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
        ? Math.min(value.reloadMinutes, 360)
        : DEFAULT_SETTINGS.reloadMinutes,
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
  const global = getSettings()
  return { ...global, ...next, reloadMinutes: global.reloadMinutes }
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
    reloadMinutes: Number.isFinite(reloadMinutes) && reloadMinutes >= 5
      ? Math.min(reloadMinutes, 360)
      : current.reloadMinutes,
  }
  try { Storage.set(SETTINGS_KEY, next) } catch { /* ignore */ }
  return next
}
