import { getProfileAccessToken, resolveProfile } from "./accounts"
import { getSettings } from "./credentials"
import { refreshOAuthToken } from "./oauth"
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
  remove(key: string, options?: { shared?: boolean }): void
}

const CACHE_KEY = "claude_usage_cache_v4"
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const MIN_LIVE_INTERVAL_MS = 3 * 60_000

export function getReloadMinutes(): number { return Math.max(5, getSettings().reloadMinutes) }
function asObject(v: unknown): Record<string, unknown> | null { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null }
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}
function clamp(n: number): number { return Math.max(0, Math.min(100, n)) }
function isoDate(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v !== "string") return { iso: null, ms: null }
  const ms = new Date(v).getTime()
  return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : { iso: null, ms: null }
}
function usageHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "anthropic-beta": "oauth-2025-04-20",
    "anthropic-version": "2023-06-01",
  }
}
function parseWindow(payload: Record<string, unknown>, key: string, name: LimitWindow["name"], label: string, seconds: number): LimitWindow | null {
  const raw = asObject(payload[key])
  if (!raw) return null
  const utilization = toNumber(raw.utilization)
  const reset = isoDate(raw.resets_at)
  if (utilization == null && !reset.iso) return null
  const usedPercent = clamp(utilization ?? 0)
  return {
    id: `claude:${key}`,
    name,
    label,
    usedPercent,
    remainingPercent: clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: seconds,
  }
}
function planLabel(payload: Record<string, unknown>): string {
  for (const key of ["subscription_type", "rate_limit_tier", "plan_type", "plan"]) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) {
      const clean = value.replace(/^default_claude_?/i, "").replace(/[_-]+/g, " ").trim()
      if (/^max\s*20x$/i.test(clean)) return "Claude Max 20×"
      if (/^max\s*5x$/i.test(clean)) return "Claude Max 5×"
      if (/^pro$/i.test(clean)) return "Claude Pro"
      if (/^team/i.test(clean)) return "Claude Team"
      return clean.replace(/\b\w/g, c => c.toUpperCase())
    }
  }
  return "Claude"
}
function cacheKey(profileId: string): string { return `${CACHE_KEY}_${profileId}` }
function readCache(profileId?: string | null): UsageSnapshot | null {
  const profile = resolveProfile(profileId); if (!profile) return null
  try { const v = Storage.get<UsageSnapshot>(cacheKey(profile.id)); return v?.fetchedAt ? { ...v, source: "cache" } : null } catch { return null }
}
function writeCache(profileId: string, value: UsageSnapshot): void {
  try { Storage.set(cacheKey(profileId), { ...value, source: "cache", raw: {} }) } catch { /* ignore */ }
}
export const getCachedUsage = (profileId?: string | null) => readCache(profileId)
export function clearUsageCache(profileId?: string | null): void { const p = resolveProfile(profileId); if (p) try { Storage.remove(cacheKey(p.id)) } catch { /* ignore */ } }
export function pickFocusWindow(snapshot: UsageSnapshot, focus: "five_hour" | "weekly" | "weekly_fable" = "five_hour"): LimitWindow | null {
  return snapshot.windows.find(w => w.name === focus) || null
}
function recent(cache: UsageSnapshot | null): boolean {
  if (!cache?.fetchedAt) return false
  const fetchedAt = new Date(cache.fetchedAt).getTime()
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < MIN_LIVE_INTERVAL_MS
}
async function requestUsage(token: string): Promise<Response> {
  return fetch(USAGE_URL, { method: "GET", headers: usageHeaders(token), timeout: 20, debugLabel: "ClaudeOAuthUsage" })
}
function errorMessage(payload: Record<string, unknown> | null): string | null {
  const error = asObject(payload?.error)
  return typeof error?.message === "string" ? error.message : null
}

export async function fetchUsage(options?: { force?: boolean; profileId?: string | null }): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId)
  if (!profile) return { ok: false, error: { code: "missing_token", message: "未找到指定账号" }, cache: null }
  const cache = readCache(profile.id)
  if (!options?.force && recent(cache)) return { ok: true, snapshot: cache! }

  let token = await refreshOAuthToken(profile.id)
  if (!token) token = getProfileAccessToken(profile.id)
  if (!token) return { ok: false, error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` }, cache }

  try {
    let response = await requestUsage(token)
    if (response.status === 401) {
      token = await refreshOAuthToken(profile.id, true)
      if (token) response = await requestUsage(token)
    }
    const text = await response.text()
    let payload: Record<string, unknown> | null = null
    try { payload = asObject(JSON.parse(text)) } catch { /* handled below */ }

    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403
      const rateLimited = response.status === 429
      const message = unauthorized
        ? "Claude OAuth 已失效或该账号无权读取用量"
        : rateLimited
          ? "Anthropic 用量接口限流，已保留最近缓存"
          : errorMessage(payload) || `Claude 用量请求失败 HTTP ${response.status}`
      return { ok: false, error: { code: unauthorized ? "unauthorized" : rateLimited ? "rate_limited" : "http_error", message, status: response.status }, cache }
    }
    if (!payload) return { ok: false, error: { code: "invalid_json", message: "Claude 用量响应不是合法 JSON" }, cache }

    const fiveHour = parseWindow(payload, "five_hour", "five_hour", "5 小时", 5 * 3600)
    const weekly = parseWindow(payload, "seven_day", "weekly", "7 天", 7 * 86400)
    const weeklyFable = parseWindow(payload, "seven_day_fable", "weekly_fable", "Fable 7 天", 7 * 86400)
      || parseWindow(payload, "seven_day_fable_5", "weekly_fable", "Fable 7 天", 7 * 86400)
      || parseWindow(payload, "fable_seven_day", "weekly_fable", "Fable 7 天", 7 * 86400)
    const windows = [fiveHour, weekly, weeklyFable].filter((w): w is LimitWindow => Boolean(w))
    if (!windows.length) return { ok: false, error: { code: "invalid_json", message: "Claude 用量响应中没有可用额度窗口" }, cache }

    const plan = planLabel(payload)
    const snapshot: UsageSnapshot = {
      windows,
      fiveHour,
      weekly,
      weeklyFable,
      planType: plan,
      planLabel: plan,
      fetchedAt: new Date().toISOString(),
      source: "live",
      raw: {},
    }
    writeCache(profile.id, snapshot)
    return { ok: true, snapshot }
  } catch (e) {
    return { ok: false, error: { code: "network_error", message: e instanceof Error ? e.message : "网络请求失败", detail: e instanceof Error ? e.message : String(e) }, cache }
  }
}
