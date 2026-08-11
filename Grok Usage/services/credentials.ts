import { getDefaultProfileId, getProfileAccessToken, getProfileAccountId, getProfileIdToken, getProfileRefreshToken, getProfileTokenExpiresAt, saveProfileCredentials, clearProfileCredentials } from "./accounts"
import type { WidgetSettings, FocusWindow, MediumWidgetLayout, WidgetLayout } from "./types"

const SETTINGS_KEY = "grok_usage_settings"
const PROFILE_SETTINGS_KEY = "grok_usage_profile_settings_v1"
const MEDIUM_LAYOUT_KEY = "grok_medium_layout_v2"

export const DEFAULT_MEDIUM_LAYOUT: MediumWidgetLayout = {
  left: 20, right: 20, topY: 10, topFont: 10,
  chipFont: 12, chipHorizontal: 10, chipVertical: 6,
  titleY: 35, titleFont: 17, mainY: 56, mainFont: 40, suffixFont: 12,
  progressY: 110, progressHeight: 7, footerY: 122,
  footerIcon: 10, footerLabelFont: 10, footerValueFont: 12, dividerHeight: 32,
  planY: 9, planFont: 10, planHorizontal: 10, planVertical: 4,
  subscriptionBadgeFont: 9, resetCountFont: 10,
  watermarkSize: 140, watermarkRight: -8, watermarkBottom: -12,
}
declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}
const DEFAULT_SETTINGS: WidgetSettings = { displayMode: "used", focusWindow: "auto", reloadMinutes: 30, provider: "grok", widgetLayout: "overview" }

// 默认账号凭证访问器。
export const getAccessToken = () => getProfileAccessToken(getDefaultProfileId())
export const getRefreshToken = () => getProfileRefreshToken(getDefaultProfileId())
export const getIdToken = () => getProfileIdToken(getDefaultProfileId())
export const getAccountId = () => getProfileAccountId(getDefaultProfileId())
export const getTokenExpiresAt = () => getProfileTokenExpiresAt(getDefaultProfileId())
export function saveOAuthCredentials(value: { accessToken: string; refreshToken?: string | null; idToken?: string | null; expiresAt?: number | null; accountId?: string | null }): boolean {
  const id = getDefaultProfileId(); return id ? saveProfileCredentials(id, value) : false
}
export function clearCredentials(): void { const id = getDefaultProfileId(); if (id) clearProfileCredentials(id) }
export function maskSecret(value: string | null): string { if (!value) return "未登录"; return value.length <= 10 ? "••••" : value.slice(0, 4) + "…" + value.slice(-4) }
function isObject(v: unknown): v is Record<string, unknown> { return Boolean(v) && typeof v === "object" && !Array.isArray(v) }
function isFocus(v: unknown): v is FocusWindow { return v === "five_hour" || v === "weekly" || v === "monthly" || v === "auto" }
function isWidgetLayout(v: unknown): v is WidgetLayout { return v === "detail" || v === "overview" }
type ProfileWidgetSettings = Pick<WidgetSettings, "displayMode" | "focusWindow" | "widgetLayout">
type ProfileSettingsRegistry = { profiles: Record<string, ProfileWidgetSettings> }
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
export function getMediumLayout(): MediumWidgetLayout {
  try {
    const value = Storage.get<Partial<MediumWidgetLayout>>(MEDIUM_LAYOUT_KEY)
    const merged = value && typeof value === "object" ? { ...DEFAULT_MEDIUM_LAYOUT, ...value } : { ...DEFAULT_MEDIUM_LAYOUT }
    return { ...merged, left: 20, right: 20 }
  } catch { return { ...DEFAULT_MEDIUM_LAYOUT, left: 20, right: 20 } }
}
export function setMediumLayout(patch: Partial<MediumWidgetLayout>): MediumWidgetLayout { const next = { ...getMediumLayout(), ...patch }; try { Storage.set(MEDIUM_LAYOUT_KEY, next) } catch {}; return next }
export function resetMediumLayout(): MediumWidgetLayout { try { Storage.set(MEDIUM_LAYOUT_KEY, { ...DEFAULT_MEDIUM_LAYOUT }) } catch {}; return { ...DEFAULT_MEDIUM_LAYOUT } }
