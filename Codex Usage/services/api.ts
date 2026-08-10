import { getProfileAccountId, getProfileAccessToken, resolveProfile } from "./accounts"
import { getSettings } from "./credentials"
import { refreshOAuthToken } from "./oauth"
import type { LimitWindow, LimitWindowName, UsageResult, UsageSnapshot } from "./types"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
  remove(key: string, options?: { shared?: boolean }): void
}

const CACHE_KEY = "codex_usage_cache_v2"
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const ACCOUNT_URL = "https://chatgpt.com/backend-api/accounts/check"
const RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"

export function getReloadMinutes(): number { return getSettings().reloadMinutes }
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null
}
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}
function clamp(n: number): number { return Math.max(0, Math.min(100, n)) }
function epoch(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v === "string" && !/^\d+(\.\d+)?$/.test(v)) {
    const ms = new Date(v).getTime()
    return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : { iso: null, ms: null }
  }
  const n = toNumber(v)
  if (n == null) return { iso: null, ms: null }
  const ms = n > 1e11 ? n : n * 1000
  return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : { iso: null, ms: null }
}
function used(obj: Record<string, unknown>): number | null {
  const u = toNumber(obj.used_percent ?? obj.usedPercent)
  if (u != null) return clamp(u)
  const r = toNumber(obj.percent_left ?? obj.remaining_percent ?? obj.remainingPercent)
  return r == null ? null : clamp(100 - r)
}
function inferName(seconds: number | null, text = ""): LimitWindowName {
  const s = text.toLowerCase()
  if (/5\s*h|five|session/.test(s)) return "five_hour"
  if (/30\s*d|month/.test(s)) return "monthly"
  if (/7\s*d|week/.test(s)) return "weekly"
  if (seconds == null) return "unknown"
  if (seconds <= 6 * 3600) return "five_hour"
  if (seconds >= 25 * 86400) return "monthly"
  if (seconds >= 6 * 86400) return "weekly"
  return "unknown"
}
function label(name: LimitWindowName, seconds: number | null): string {
  if (name === "five_hour") return "5 小时"
  if (name === "weekly") return "每周"
  if (name === "monthly") return "每月"
  if (seconds && seconds >= 86400) return `${Math.round(seconds / 86400)} 天`
  return "限额"
}
function parseWindow(value: unknown, id: string, hint = ""): LimitWindow | null {
  let obj = asObject(value)
  if (!obj) return null
  if (!obj.reset_at && !obj.used_percent && asObject(obj.primary_window)) obj = asObject(obj.primary_window)!
  const seconds = toNumber(obj.limit_window_seconds ?? obj.window_seconds ?? obj.limit_window)
  const name = inferName(seconds, `${id} ${hint}`)
  const reset = epoch(obj.reset_at ?? obj.reset_time_ms ?? obj.resetAt ?? obj.reset_time)
  const usedPercent = used(obj)
  if (usedPercent == null && !reset.iso) return null
  return {
    id,
    name,
    label: label(name, seconds),
    usedPercent,
    remainingPercent: usedPercent == null ? null : clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: seconds,
  }
}
function collectFromRateLimit(rate: Record<string, unknown>, prefix: string, hint = ""): LimitWindow[] {
  const out: LimitWindow[] = []
  const keys = ["primary_window", "primaryWindow", "secondary_window", "secondaryWindow", "five_hour", "weekly", "monthly"]
  const seen = new Set<unknown>()
  for (const key of keys) {
    const value = rate[key]
    if (!value || seen.has(value)) continue
    seen.add(value)
    const parsed = parseWindow(value, `${prefix}:${key}`, `${hint} ${key}`)
    if (parsed) out.push(parsed)
  }
  return out
}
function extractWindows(payload: Record<string, unknown>): LimitWindow[] {
  const out: LimitWindow[] = []
  const root = asObject(payload.rate_limit) || asObject(payload.rateLimit) || payload
  out.push(...collectFromRateLimit(root, "codex"))
  const additional = payload.additional_rate_limits ?? root.additional_rate_limits
  if (Array.isArray(additional)) {
    additional.forEach((item, i) => {
      const obj = asObject(item)
      const rate = asObject(obj?.rate_limit) || obj
      if (rate) out.push(...collectFromRateLimit(rate, `extra${i}`, String(obj?.limit_name || obj?.metered_feature || "")))
    })
  }
  const direct: Array<[string, LimitWindowName]> = [["five_hour", "five_hour"], ["weekly", "weekly"], ["monthly", "monthly"]]
  for (const [key, name] of direct) {
    const parsed = parseWindow(payload[key], `direct:${key}`, key)
    if (parsed && !out.some(x => x.name === name)) out.push(parsed)
  }
  const unique: LimitWindow[] = []
  for (const w of out) {
    if (!unique.some(x => x.name === w.name && x.resetAtMs === w.resetAtMs && x.usedPercent === w.usedPercent)) unique.push(w)
  }
  return unique.sort((a, b) => (a.windowSeconds || 1e20) - (b.windowSeconds || 1e20))
}
function firstDate(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const d = epoch(obj[key])
    if (d.iso) return d.iso
  }
  return null
}
function parseSubscriptionExpiry(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const keys = [
    "subscription_expires_at_timestamp", "subscription_expires_at",
    "subscription_expiration", "subscription_expiry", "subscription_end_date",
    "current_period_end", "period_end", "plan_expires_at", "renewal_date", "renews_at",
  ]
  const seen = new Set<unknown>()
  function visit(value: unknown, depth: number): string | null {
    if (depth > 6 || !value || seen.has(value)) return null
    if (typeof value !== "object") return null
    seen.add(value)
    const obj = asObject(value)
    if (obj) {
      const direct = firstDate(obj, keys)
      if (direct) return direct
      for (const [key, child] of Object.entries(obj)) {
        // 避免把 OAuth/JWT access token 的 expires_at 误判为订阅到期。
        if (/token|oauth|session|auth/i.test(key)) continue
        const found = visit(child, depth + 1)
        if (found) return found
      }
    } else if (Array.isArray(value)) {
      for (const child of value) {
        const found = visit(child, depth + 1)
        if (found) return found
      }
    }
    return null
  }
  return visit(payload, 0)
}
function planLabel(payload: Record<string, unknown>, accountPayload: Record<string, unknown> | null): string | null {
  const raw = String(payload.plan_type || "").toLowerCase()
  const source = JSON.stringify({ usage: payload, account: accountPayload }).toLowerCase()
  if (/pro[_ -]?20x|pro[_ -]?5x|"multiplier"\s*:\s*(20|5)|"usage_multiplier"\s*:\s*(20|5)/.test(source)) return "Pro"
  if (raw === "plus") return "Plus"
  if (raw === "team" || raw === "business" || raw.includes("business")) return "Team"
  if (raw === "pro" || raw === "prolite") return "Pro"
  return raw ? raw.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase()) : null
}
function resetCreditsFrom(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null
  const value = toNumber(payload.available_count ?? asObject(payload.rate_limit_reset_credits)?.available_count)
  return value == null ? null : Math.max(0, Math.floor(value))
}
function authHeaders(token: string, accountId: string | null): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json", Origin: "https://chatgpt.com", Referer: "https://chatgpt.com/" }
  if (accountId) h["ChatGPT-Account-Id"] = accountId
  return h
}
function cacheKey(profileId: string): string { return `${CACHE_KEY}_${profileId}` }
function readCache(profileId?: string | null): UsageSnapshot | null {
  const profile = resolveProfile(profileId)
  if (!profile) return null
  try {
    const v = Storage.get<UsageSnapshot>(cacheKey(profile.id))
    return v?.fetchedAt ? { ...v, source: "cache" } : null
  } catch { return null }
}
function writeCache(profileId: string, v: UsageSnapshot): void {
  try { Storage.set(cacheKey(profileId), { ...v, source: "cache", raw: {} }) } catch { /* ignore */ }
}
export const getCachedUsage = (profileId?: string | null) => readCache(profileId)
export function clearUsageCache(profileId?: string | null): void {
  const profile = resolveProfile(profileId); if (!profile) return
  try { Storage.remove(cacheKey(profile.id)) } catch { /* ignore */ }
}

export function pickFocusWindow(snapshot: UsageSnapshot, focus: "weekly" | "five_hour" | "monthly" = "weekly"): LimitWindow | null {
  return snapshot.windows.find(w => w.name === focus) || null
}

export async function fetchUsage(options?: { force?: boolean; profileId?: string | null }): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId)
  if (!profile) return { ok: false, error: { code: "missing_token", message: "未找到指定账号" }, cache: null }
  const cache = readCache(profile.id)
  let token = await refreshOAuthToken(profile.id, Boolean(options?.force && !cache))
  if (!token) token = getProfileAccessToken(profile.id)
  if (!token) return { ok: false, error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` }, cache }
  const accountId = getProfileAccountId(profile.id)
  try {
    let response = await fetch(USAGE_URL, { method: "GET", headers: authHeaders(token, accountId), timeout: 20, debugLabel: "CodexUsage" })
    if (response.status === 401) {
      token = await refreshOAuthToken(profile.id, true)
      if (token) response = await fetch(USAGE_URL, { method: "GET", headers: authHeaders(token, accountId), timeout: 20, debugLabel: "CodexUsageRetry" })
    }
    const text = await response.text()
    let payload: Record<string, unknown> | null = null
    try { payload = asObject(JSON.parse(text)) } catch { /* handled below */ }
    if (!response.ok) return { ok: false, error: { code: response.status === 401 || response.status === 403 ? "unauthorized" : "http_error", message: response.status === 401 || response.status === 403 ? "登录已失效，请重新登录" : `请求失败 HTTP ${response.status}` }, cache }
    if (!payload) return { ok: false, error: { code: "invalid_json", message: "用量响应不是合法 JSON" }, cache }

    let accountPayload: Record<string, unknown> | null = null
    let resetPayload: Record<string, unknown> | null = null
    try {
      const accountResponse = await fetch(ACCOUNT_URL, { method: "GET", headers: authHeaders(token!, accountId), timeout: 12, debugLabel: "CodexAccount" })
      if (accountResponse.ok) accountPayload = asObject(JSON.parse(await accountResponse.text()))
    } catch { /* 到期时间为可选，不影响用量 */ }
    try {
      const resetResponse = await fetch(RESET_CREDITS_URL, { method: "GET", headers: authHeaders(token!, accountId), timeout: 12, debugLabel: "CodexResetCredits" })
      if (resetResponse.ok) resetPayload = asObject(JSON.parse(await resetResponse.text()))
    } catch { /* 重置次数为可选，不影响用量 */ }

    const windows = extractWindows(payload)
    const rawPlanType = typeof payload.plan_type === "string" ? payload.plan_type : null
    const snapshot: UsageSnapshot = {
      windows,
      fiveHour: windows.find(w => w.name === "five_hour") || null,
      weekly: windows.find(w => w.name === "weekly") || null,
      monthly: windows.find(w => w.name === "monthly") || null,
      planType: rawPlanType,
      planLabel: planLabel(payload, accountPayload),
      subscriptionExpiresAt: parseSubscriptionExpiry(accountPayload) || parseSubscriptionExpiry(payload),
      resetCreditsAvailable: resetCreditsFrom(resetPayload) ?? resetCreditsFrom(payload),
      fetchedAt: new Date().toISOString(),
      source: "live",
      raw: payload,
    }
    writeCache(profile.id, snapshot)
    return { ok: true, snapshot }
  } catch (e) {
    return { ok: false, error: { code: "network_error", message: "网络请求失败", detail: e instanceof Error ? e.message : String(e) }, cache }
  }
}
