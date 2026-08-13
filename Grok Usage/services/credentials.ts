import type { WidgetSettings } from "./types"

const SETTINGS_KEY = "grok_usage_settings"
const PROFILE_SETTINGS_KEY = "grok_usage_profile_settings_v1"
declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}
const DEFAULT_SETTINGS: WidgetSettings = { displayMode: "used", reloadMinutes: 30, provider: "grok" }

function isObject(v: unknown): v is Record<string, unknown> { return Boolean(v) && typeof v === "object" && !Array.isArray(v) }
type ProfileWidgetSettings = Pick<WidgetSettings, "displayMode">
type ProfileSettingsRegistry = { profiles: Record<string, ProfileWidgetSettings> }
function sanitizeDisplaySettings(value: unknown, fallback: ProfileWidgetSettings): ProfileWidgetSettings {
  const object = isObject(value) ? value : {}
  return {
    displayMode: object.displayMode === "remaining" ? "remaining" : object.displayMode === "used" ? "used" : fallback.displayMode,
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
    const v = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY)
    if (!v || typeof v !== "object") return { ...DEFAULT_SETTINGS }
    const display = sanitizeDisplaySettings(v, DEFAULT_SETTINGS)
    return {
      ...display,
      reloadMinutes: typeof v.reloadMinutes === "number" && v.reloadMinutes >= 5 ? Math.min(v.reloadMinutes, 360) : 30,
      provider: "grok",
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}
export function getEffectiveSettings(profileId?: string | null): WidgetSettings {
  const global = getSettings()
  if (!profileId) return global
  const profile = readProfileRegistry().profiles[profileId]
  return profile ? { ...global, ...profile, reloadMinutes: global.reloadMinutes, provider: "grok" } : global
}
export function setProfileSettings(profileId: string, patch: Partial<ProfileWidgetSettings>): WidgetSettings {
  if (!profileId) return getSettings()
  const current = getEffectiveSettings(profileId)
  const next = sanitizeDisplaySettings({ ...current, ...patch }, current)
  const registry = readProfileRegistry()
  registry.profiles[profileId] = next
  writeProfileRegistry(registry)
  const global = getSettings()
  return { ...global, ...next, reloadMinutes: global.reloadMinutes, provider: "grok" }
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
    provider: "grok" as const,
  }
  try { Storage.set(SETTINGS_KEY, next) } catch { /* ignore */ }
  return next
}