import { getProfileAccessToken, resolveProfile } from "./accounts"
import { getSettings } from "./credentials"
import {
  noteDiagnostic,
  writeLastUsageProbe,
  type UsageProbe,
} from "./diagnostics"
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
const CLIENT_USER_AGENT = "claude-code/1.3.4"

export function getClientUserAgent(): string { return CLIENT_USER_AGENT }
export function getUsageEndpoint(): string { return USAGE_URL }
export function getReloadMinutes(): number { return Math.max(5, getSettings().reloadMinutes) }

function asObject(v: unknown): Record<string, unknown> | null { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null }
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}
function clamp(n: number): number { return Math.max(0, Math.min(100, n)) }
function debug(event: string, data: Record<string, unknown> = {}): void {
  noteDiagnostic(event, data)
}
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
    "User-Agent": CLIENT_USER_AGENT,
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
  const usedPercent = utilization == null ? null : clamp(utilization)
  return {
    id: `claude:${key}`,
    name,
    label,
    usedPercent,
    remainingPercent: usedPercent == null ? null : clamp(100 - usedPercent),
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
  return fetch(USAGE_URL, { method: "GET", headers: usageHeaders(token), timeout: 20, deviceLabel: "ClaudeOAuthUsage" })
}
function errorMessage(payload: Record<string, unknown> | null): string | null {
  const error = asObject(payload?.error)
  return typeof error?.message === "string" ? error.message : null
}

function saveProbe(partial: Omit<UsageProbe, "at" | "clientUserAgent" | "endpoint">): void {
  writeLastUsageProbe({
    at: new Date().toISOString(),
    clientUserAgent: CLIENT_USER_AGENT,
    endpoint: USAGE_URL,
    ...partial,
  })
}

export async function fetchUsage(options?: { force?: boolean; profileId?: string | null }): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId)
  if (!profile) {
    saveProbe({
      profileId: null,
      force: Boolean(options?.force),
      ok: false,
      fromCacheOnly: false,
      errorCode: "missing_token",
      errorMessage: "未找到指定账号",
      httpStatus: null,
      emptyWindows: null,
      windowCount: null,
      planLabel: null,
      source: null,
      hasCache: false,
      cacheFetchedAt: null,
    })
    return { ok: false, error: { code: "missing_token", message: "未找到指定账号" }, cache: null }
  }
  const cache = readCache(profile.id)
  const cacheIsRecent = recent(cache)
  debug("fetch.start", {
    force: Boolean(options?.force),
    hasCache: Boolean(cache),
    cacheFetchedAt: cache?.fetchedAt || null,
    cacheIsRecent,
    profileId: profile.id,
    clientUserAgent: CLIENT_USER_AGENT,
  })
  if (!options?.force && cacheIsRecent) {
    debug("cache.hit", { fetchedAt: cache!.fetchedAt, profileId: profile.id })
    saveProbe({
      profileId: profile.id,
      force: false,
      ok: true,
      fromCacheOnly: true,
      errorCode: null,
      errorMessage: null,
      httpStatus: null,
      emptyWindows: cache!.windows.length === 0,
      windowCount: cache!.windows.length,
      planLabel: cache!.planLabel,
      source: "cache",
      hasCache: true,
      cacheFetchedAt: cache!.fetchedAt,
    })
    return { ok: true, snapshot: cache! }
  }

  let token = await refreshOAuthToken(profile.id)
  if (!token) token = getProfileAccessToken(profile.id)
  if (!token) {
    saveProbe({
      profileId: profile.id,
      force: Boolean(options?.force),
      ok: false,
      fromCacheOnly: false,
      errorCode: "missing_token",
      errorMessage: `账号尚未授权`,
      httpStatus: null,
      emptyWindows: null,
      windowCount: null,
      planLabel: null,
      source: null,
      hasCache: Boolean(cache),
      cacheFetchedAt: cache?.fetchedAt || null,
    })
    return { ok: false, error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` }, cache }
  }

  try {
    let response = await requestUsage(token)
    if (response.status === 401) {
      const refreshedToken = await refreshOAuthToken(profile.id, true)
      debug("auth.retry", { status: 401, refreshed: Boolean(refreshedToken), profileId: profile.id })
      if (refreshedToken) {
        token = refreshedToken
        response = await requestUsage(token)
      }
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
      debug("http.error", {
        endpoint: "usage",
        status: response.status,
        unauthorized,
        rateLimited,
        hasCache: Boolean(cache),
        profileId: profile.id,
        clientUserAgent: CLIENT_USER_AGENT,
      })
      saveProbe({
        profileId: profile.id,
        force: Boolean(options?.force),
        ok: false,
        fromCacheOnly: false,
        errorCode: unauthorized ? "unauthorized" : rateLimited ? "rate_limited" : "http_error",
        errorMessage: message,
        httpStatus: response.status,
        emptyWindows: null,
        windowCount: null,
        planLabel: null,
        source: null,
        hasCache: Boolean(cache),
        cacheFetchedAt: cache?.fetchedAt || null,
      })
      return { ok: false, error: { code: unauthorized ? "unauthorized" : rateLimited ? "rate_limited" : "http_error", message, status: response.status }, cache }
    }
    if (!payload) {
      saveProbe({
        profileId: profile.id,
        force: Boolean(options?.force),
        ok: false,
        fromCacheOnly: false,
        errorCode: "invalid_json",
        errorMessage: "Claude 用量响应不是合法 JSON",
        httpStatus: response.status,
        emptyWindows: null,
        windowCount: null,
        planLabel: null,
        source: null,
        hasCache: Boolean(cache),
        cacheFetchedAt: cache?.fetchedAt || null,
      })
      return { ok: false, error: { code: "invalid_json", message: "Claude 用量响应不是合法 JSON" }, cache }
    }

    const fiveHour = parseWindow(payload, "five_hour", "five_hour", "5 小时", 5 * 3600)
    const weekly = parseWindow(payload, "seven_day", "weekly", "周限", 7 * 86400)
    const weeklyFable = parseWindow(payload, "seven_day_fable", "weekly_fable", "Fable 周限", 7 * 86400)
      || parseWindow(payload, "seven_day_fable_5", "weekly_fable", "Fable 周限", 7 * 86400)
      || parseWindow(payload, "fable_seven_day", "weekly_fable", "Fable 周限", 7 * 86400)
    const windows = [fiveHour, weekly, weeklyFable].filter((w): w is LimitWindow => Boolean(w))
    if (!windows.length) debug("parse.empty", { reason: "all_windows_null", profileId: profile.id })

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
    debug("fetch.success", {
      plan,
      windows: windows.map(window => ({ name: window.name, usedPercent: window.usedPercent, resetAt: window.resetAt })),
      fetchedAt: snapshot.fetchedAt,
      emptyWindows: windows.length === 0,
      profileId: profile.id,
      clientUserAgent: CLIENT_USER_AGENT,
    })
    saveProbe({
      profileId: profile.id,
      force: Boolean(options?.force),
      ok: true,
      fromCacheOnly: false,
      errorCode: null,
      errorMessage: null,
      httpStatus: response.status,
      emptyWindows: windows.length === 0,
      windowCount: windows.length,
      planLabel: plan,
      source: "live",
      hasCache: Boolean(cache),
      cacheFetchedAt: cache?.fetchedAt || null,
    })
    return { ok: true, snapshot }
  } catch (e) {
    debug("fetch.error", {
      name: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message : String(e),
      hasCache: Boolean(cache),
      profileId: profile.id,
    })
    saveProbe({
      profileId: profile.id,
      force: Boolean(options?.force),
      ok: false,
      fromCacheOnly: false,
      errorCode: "network_error",
      errorMessage: e instanceof Error ? e.message : "网络请求失败",
      httpStatus: null,
      emptyWindows: null,
      windowCount: null,
      planLabel: null,
      source: null,
      hasCache: Boolean(cache),
      cacheFetchedAt: cache?.fetchedAt || null,
    })
    return { ok: false, error: { code: "network_error", message: e instanceof Error ? e.message : "网络请求失败", detail: e instanceof Error ? e.message : String(e) }, cache }
  }
}
