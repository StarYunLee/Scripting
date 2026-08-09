import { getDefaultProfileId, getProfileAccessToken, getProfileAccountId, getProfileIdToken, getProfileRefreshToken, getProfileTokenExpiresAt, saveProfileCredentials, clearProfileCredentials } from "./accounts"
import type { WidgetSettings, DisplayMode, FocusWindow, ProviderBrand, MediumWidgetLayout } from "./types"

const SETTINGS_KEY = "codex_usage_settings"
const MEDIUM_LAYOUT_KEY = "codex_medium_layout_debug_v1"

export const DEFAULT_MEDIUM_LAYOUT: MediumWidgetLayout = {
  left: 20, right: 20, topY: 10, topFont: 10,
  chipFont: 12, chipHorizontal: 10, chipVertical: 6,
  titleY: 35, titleFont: 17, mainY: 56, mainFont: 40, suffixFont: 12,
  progressY: 110, progressHeight: 7, footerY: 122,
  footerIcon: 10, footerLabelFont: 10, footerValueFont: 12, dividerHeight: 32,
  planY: 9, planFont: 10, planHorizontal: 10, planVertical: 4,
  subscriptionBadgeFont: 9, resetCountFont: 10,
  watermarkSize: 135, watermarkRight: -8, watermarkBottom: -12,
}
declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}
const DEFAULT_SETTINGS: WidgetSettings = { displayMode: "used", focusWindow: "auto", reloadMinutes: 30, provider: "chatgpt" }

// 兼容旧调用：默认账号。
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
function isProvider(v: unknown): v is ProviderBrand { return v === "chatgpt" || v === "claude" || v === "grok" }
function isFocus(v: unknown): v is FocusWindow { return v === "five_hour" || v === "weekly" || v === "monthly" || v === "auto" }
export function getSettings(): WidgetSettings {
  try {
    const v = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY)
    if (!v || typeof v !== "object") return { ...DEFAULT_SETTINGS }
    return {
      displayMode: v.displayMode === "remaining" ? "remaining" : "used",
      focusWindow: isFocus(v.focusWindow) ? v.focusWindow : DEFAULT_SETTINGS.focusWindow,
      reloadMinutes: typeof v.reloadMinutes === "number" && v.reloadMinutes >= 5 ? Math.min(v.reloadMinutes, 360) : 30,
      provider: isProvider(v.provider) ? v.provider : "chatgpt",
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}
export function setSettings(patch: Partial<WidgetSettings>): WidgetSettings { const next = { ...getSettings(), ...patch }; try { Storage.set(SETTINGS_KEY, next) } catch {}; return next }
export const setDisplayMode = (displayMode: DisplayMode) => setSettings({ displayMode })
export const setFocusWindow = (focusWindow: FocusWindow) => setSettings({ focusWindow })
export const setProvider = (provider: ProviderBrand) => setSettings({ provider })
export function getMediumLayout(): MediumWidgetLayout {
  try {
    const value = Storage.get<Partial<MediumWidgetLayout>>(MEDIUM_LAYOUT_KEY)
    const merged = value && typeof value === "object" ? { ...DEFAULT_MEDIUM_LAYOUT, ...value } : { ...DEFAULT_MEDIUM_LAYOUT }
    return { ...merged, left: 20, right: 20 }
  } catch { return { ...DEFAULT_MEDIUM_LAYOUT, left: 20, right: 20 } }
}
export function setMediumLayout(patch: Partial<MediumWidgetLayout>): MediumWidgetLayout { const next = { ...getMediumLayout(), ...patch }; try { Storage.set(MEDIUM_LAYOUT_KEY, next) } catch {}; return next }
export function resetMediumLayout(): MediumWidgetLayout { try { Storage.set(MEDIUM_LAYOUT_KEY, { ...DEFAULT_MEDIUM_LAYOUT }) } catch {}; return { ...DEFAULT_MEDIUM_LAYOUT } }
