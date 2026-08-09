import { getProfileAccessToken, resolveProfile } from "./accounts"
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
function isoDate(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v !== "string") return { iso: null, ms: null }
  const ms = new Date(v).getTime(); return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : { iso: null, ms: null }
}
function billingHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "x-xai-token-auth": "xai-grok-cli", Accept: "application/json" }
}
async function requestBilling(token: string, credits = false): Promise<Response> {
  return fetch(credits ? `${BILLING_URL}?format=credits` : BILLING_URL, {
    method: "GET", headers: billingHeaders(token), timeout: 20,
    debugLabel: credits ? "GrokWeeklyUsage" : "GrokMonthlyUsage",
  })
}
function parseMonthly(payload: Record<string, unknown>): LimitWindow {
  const config = asObject(payload.config); if (!config) throw new Error("月度额度响应缺少 config")
  const limit = toNumber(asObject(config.monthlyLimit)?.val)
  const used = toNumber(asObject(config.used)?.val)
  const reset = isoDate(config.billingPeriodEnd)
  if (limit == null || limit <= 0 || used == null || !reset.iso) throw new Error("月度额度响应字段不完整")
  const usedPercent = clamp(used / limit * 100)
  return {
    id: "grok:monthly", name: "monthly", label: "每月", usedPercent,
    remainingPercent: clamp(100 - usedPercent), resetAt: reset.iso, resetAtMs: reset.ms,
    windowSeconds: 30 * 86400, usedValue: used, limitValue: limit, unit: "credits",
  }
}
function parseWeekly(payload: Record<string, unknown>): LimitWindow | null {
  const config = asObject(payload.config); if (!config) return null
  const period = asObject(config.currentPeriod)
  if (period?.type !== "USAGE_PERIOD_TYPE_WEEKLY") return null
  const reset = isoDate(config.billingPeriodEnd); if (!reset.iso) return null
  const usedPercent = clamp(toNumber(config.creditUsagePercent) ?? 0)
  return {
    id: "grok:weekly", name: "weekly", label: "每周", usedPercent,
    remainingPercent: clamp(100 - usedPercent), resetAt: reset.iso, resetAtMs: reset.ms,
    windowSeconds: 7 * 86400,
  }
}
function planFromMonthly(window: LimitWindow): string {
  // Grok CLI 公开实现按月额度分层：≤20,000 映射 SuperGrok，>20,000 映射 Heavy。
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
  let token = await refreshOAuthToken(profile.id, Boolean(options?.force && !cache))
  if (!token) token = getProfileAccessToken(profile.id)
  if (!token) return { ok: false, error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` }, cache }
  try {
    let monthlyResponse = await requestBilling(token)
    if (monthlyResponse.status === 401) {
      token = await refreshOAuthToken(profile.id, true)
      if (token) monthlyResponse = await requestBilling(token)
    }
    const monthlyText = await monthlyResponse.text()
    let monthlyPayload: Record<string, unknown> | null = null
    try { monthlyPayload = asObject(JSON.parse(monthlyText)) } catch { /* handled below */ }
    if (!monthlyResponse.ok) {
      const unauthorized = monthlyResponse.status === 401 || monthlyResponse.status === 403
      return { ok: false, error: { code: unauthorized ? "unauthorized" : "http_error", message: unauthorized ? "Grok Build 授权无效或当前账号没有订阅额度权限" : `Grok Build 额度请求失败 HTTP ${monthlyResponse.status}` }, cache }
    }
    if (!monthlyPayload) return { ok: false, error: { code: "invalid_json", message: "月度额度响应不是合法 JSON" }, cache }
    const monthly = parseMonthly(monthlyPayload)

    let weekly: LimitWindow | null = null
    try {
      const weeklyResponse = await requestBilling(token, true)
      if (weeklyResponse.ok) weekly = parseWeekly(asObject(JSON.parse(await weeklyResponse.text())) || {})
    } catch { /* 周额度为可选，不影响月度额度 */ }
    const windows = weekly ? [weekly, monthly] : [monthly]
    const plan = planFromMonthly(monthly)
    const snapshot: UsageSnapshot = {
      windows, fiveHour: null, weekly, monthly,
      planType: plan, planLabel: plan,
      subscriptionExpiresAt: null,
      fetchedAt: new Date().toISOString(), source: "live", raw: {},
    }
    writeCache(profile.id, snapshot)
    return { ok: true, snapshot }
  } catch (e) {
    return { ok: false, error: { code: "network_error", message: e instanceof Error ? e.message : "网络请求失败", detail: e instanceof Error ? e.message : String(e) }, cache }
  }
}
