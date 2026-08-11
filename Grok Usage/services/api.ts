import { getProfileAccessToken, getProfileAccountId, resolveProfile } from "./accounts"
import { getSettings } from "./credentials"
import { refreshOAuthToken } from "./oauth"
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
  remove(key: string, options?: { shared?: boolean }): void
}

const CACHE_KEY = "grok_usage_cache_v3"
const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing"

export function getReloadMinutes(): number { return getSettings().reloadMinutes }
function asObject(v: unknown): Record<string, unknown> | null { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null }
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}
function clamp(n: number): number { return Math.max(0, Math.min(100, n)) }
function debug(event: string, data: Record<string, unknown> = {}): void {
  try { console.log(`[Grok Usage] ${event} ${JSON.stringify(data)}`) } catch { /* logging must not affect runtime */ }
}
function isoDate(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v !== "string") return { iso: null, ms: null }
  const ms = new Date(v).getTime(); return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : { iso: null, ms: null }
}
function billingHeaders(token: string, userId: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-version": "grok-usage-scripting/1.3.0",
    Accept: "application/json",
  }
  if (userId) headers["x-userid"] = userId
  return headers
}
async function requestBilling(token: string, userId: string | null, credits = false): Promise<Response> {
  return fetch(credits ? `${BILLING_URL}?format=credits` : BILLING_URL, {
    method: "GET", headers: billingHeaders(token, userId), timeout: 20,
    debugLabel: credits ? "GrokWeeklyUsage" : "GrokMonthlyUsage",
  })
}
function parseMonthly(payload: Record<string, unknown>): LimitWindow {
  const config = asObject(payload.config)
  if (!config) {
    debug("monthly.error", { reason: "config_missing" })
    throw new Error("月度额度响应缺少 config")
  }
  const limitRaw = asObject(config.monthlyLimit)?.val
  const usedRaw = asObject(config.used)?.val
  const limit = toNumber(limitRaw)
  const used = toNumber(usedRaw)
  const resetRaw = config.billingPeriodEnd
  const reset = isoDate(resetRaw)
  const percentageAvailable = limit != null && limit > 0 && used != null
  const valid = limit != null && limit >= 0 && used != null && used >= 0 && Boolean(reset.iso)
  if (!valid) {
    debug("monthly.error", { reason: "invalid_fields", usedValue: used, limitValue: limit, resetAt: reset.iso })
    throw new Error("月度额度响应字段不完整，请查看运行日志")
  }
  const usedPercent = percentageAvailable ? clamp(used / limit * 100) : null
  debug("monthly.quota", { usedPercent, usedValue: used, limitValue: limit, resetAt: reset.iso })
  return {
    id: "grok:monthly", name: "monthly", label: "每月", usedPercent,
    remainingPercent: usedPercent == null ? null : clamp(100 - usedPercent), resetAt: reset.iso, resetAtMs: reset.ms,
    windowSeconds: 30 * 86400, usedValue: used, limitValue: limit, unit: "credits",
  }
}
function parseWeekly(payload: Record<string, unknown>): LimitWindow | null {
  const config = asObject(payload.config)
  if (!config) { debug("weekly.error", { reason: "config_missing" }); return null }
  const period = asObject(config.currentPeriod)
  const periodType = period?.type
  if (periodType !== "USAGE_PERIOD_TYPE_WEEKLY") { debug("weekly.error", { reason: "period_not_weekly" }); return null }
  const resetRaw = config.billingPeriodEnd
  const reset = isoDate(resetRaw)
  const productUsage = Array.isArray(config.productUsage) ? config.productUsage : []
  const grokBuildUsage = productUsage
    .map(item => asObject(item))
    .find(item => item?.product === "GrokBuild")
  const productUsagePercent = toNumber(grokBuildUsage?.usagePercent)
  const creditUsagePercent = toNumber(config.creditUsagePercent)
  const usedNumber = productUsagePercent ?? creditUsagePercent
  if (!reset.iso) { debug("weekly.error", { reason: "invalid_reset" }); return null }
  const usedPercent = usedNumber == null ? null : clamp(usedNumber)
  debug("weekly.quota", {
    usedPercent,
    source: productUsagePercent != null ? "productUsage.GrokBuild" : creditUsagePercent != null ? "creditUsagePercent" : "missing",
    resetAt: reset.iso,
  })
  return {
    id: "grok:weekly", name: "weekly", label: "每周", usedPercent,
    remainingPercent: usedPercent == null ? null : clamp(100 - usedPercent), resetAt: reset.iso, resetAtMs: reset.ms,
    windowSeconds: 7 * 86400,
  }
}
function planFromMonthly(window: LimitWindow): string {
  // 月度额度仅用于套餐标签的兜底识别。
  return (window.limitValue || 0) > 20000 ? "SuperGrok Heavy" : "SuperGrok"
}
function cacheKey(profileId: string): string { return `${CACHE_KEY}_${profileId}` }
function readCache(profileId?: string | null): UsageSnapshot | null {
  const profile = resolveProfile(profileId); if (!profile) return null
  try { const v = Storage.get<UsageSnapshot>(cacheKey(profile.id)); return v?.fetchedAt ? { ...v, source: "cache" } : null } catch { return null }
}
function writeCache(profileId: string, value: UsageSnapshot): void { try { Storage.set(cacheKey(profileId), { ...value, source: "cache", raw: {} }) } catch { /* ignore */ } }
export const getCachedUsage = (profileId?: string | null) => readCache(profileId)
export function clearUsageCache(profileId?: string | null): void { const p = resolveProfile(profileId); if (p) try { Storage.remove(cacheKey(p.id)) } catch { /* ignore */ } }
export function pickFocusWindow(snapshot: UsageSnapshot, focus: "weekly" | "five_hour" | "monthly" | "auto" = "auto"): LimitWindow | null {
  if (focus !== "auto") return snapshot.windows.find(w => w.name === focus) || snapshot.windows[0] || null
  return snapshot.weekly || snapshot.monthly || snapshot.windows[0] || null
}

export async function fetchUsage(options?: { force?: boolean; profileId?: string | null }): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId)
  if (!profile) return { ok: false, error: { code: "missing_token", message: "未找到指定账号" }, cache: null }
  const cache = readCache(profile.id)
  const userId = getProfileAccountId(profile.id)
  debug("fetch.start", { force: Boolean(options?.force), hasCache: Boolean(cache), cacheFetchedAt: cache?.fetchedAt || null, hasUserId: Boolean(userId) })
  let token = await refreshOAuthToken(profile.id, Boolean(options?.force && !cache))
  if (!token) token = getProfileAccessToken(profile.id)
  if (!token) return { ok: false, error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` }, cache }
  try {
    let monthlyResponse = await requestBilling(token, userId)
    if (monthlyResponse.status === 401) {
      const refreshedToken = await refreshOAuthToken(profile.id, true)
      debug("auth.retry", { status: 401, refreshed: Boolean(refreshedToken) })
      if (refreshedToken) {
        token = refreshedToken
        monthlyResponse = await requestBilling(token, userId)
      }
    }
    const monthlyText = await monthlyResponse.text()
    let monthlyPayload: Record<string, unknown> | null = null
    try { monthlyPayload = asObject(JSON.parse(monthlyText)) } catch { /* handled below */ }
    if (!monthlyResponse.ok) {
      const unauthorized = monthlyResponse.status === 401 || monthlyResponse.status === 403
      debug("http.error", { endpoint: "monthly", status: monthlyResponse.status, unauthorized })
      return { ok: false, error: { code: unauthorized ? "unauthorized" : "http_error", message: unauthorized ? "Grok Build 授权无效或当前账号没有订阅额度权限" : `Grok Build 额度请求失败 HTTP ${monthlyResponse.status}` }, cache }
    }
    if (!monthlyPayload) return { ok: false, error: { code: "invalid_json", message: "月度额度响应不是合法 JSON" }, cache }
    const monthly = parseMonthly(monthlyPayload)

    let weekly: LimitWindow | null = null
    try {
      const weeklyResponse = await requestBilling(token, userId, true)
      const weeklyText = await weeklyResponse.text()
      if (weeklyResponse.ok) {
        weekly = parseWeekly(asObject(JSON.parse(weeklyText)) || {})
      } else {
        debug("http.error", { endpoint: "weekly", status: weeklyResponse.status, unauthorized: weeklyResponse.status === 401 || weeklyResponse.status === 403 })
      }
    } catch (e) {
      debug("weekly.error", { reason: "request_or_parse_failed", message: e instanceof Error ? e.message : String(e) })
    }
    const windows = weekly ? [weekly, monthly] : [monthly]
    const plan = planFromMonthly(monthly)
    const snapshot: UsageSnapshot = {
      windows, fiveHour: null, weekly, monthly,
      planType: plan, planLabel: plan,
      subscriptionExpiresAt: null,
      fetchedAt: new Date().toISOString(), source: "live", raw: {},
    }
    writeCache(profile.id, snapshot)
    debug("fetch.success", {
      plan,
      weeklyPercent: weekly?.usedPercent ?? null,
      monthlyPercent: monthly.usedPercent,
      monthlyCredits: { used: monthly.usedValue ?? null, limit: monthly.limitValue ?? null },
      fetchedAt: snapshot.fetchedAt,
    })
    return { ok: true, snapshot }
  } catch (e) {
    debug("fetch.error", { name: e instanceof Error ? e.name : "unknown", message: e instanceof Error ? e.message : String(e), hasCache: Boolean(cache) })
    return { ok: false, error: { code: "network_error", message: e instanceof Error ? e.message : "网络请求失败", detail: e instanceof Error ? e.message : String(e) }, cache }
  }
}
