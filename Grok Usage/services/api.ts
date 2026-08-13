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
const REMAINING_RESETS_URL = "https://grok.com/prod_mc_billing.ConsumerUiSvc/GetRemainingResets"
const MIN_LIVE_INTERVAL_MS = 3 * 60_000

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
    "x-grok-client-version": "grok-usage-scripting/1.5.1",
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
type ResetCreditsSummary = { available: number; expirations: string[] }
function readVarint(data: Uint8Array, start: number): [number, number] {
  let value = 0, shift = 0, index = start
  while (index < data.length && shift <= 49) {
    const byte = data[index++]; value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return [value, index]
    shift += 7
  }
  throw new Error("重置权益响应不完整")
}
function protobufFields(data: Uint8Array): Array<{ number: number; wire: number; value: number | Uint8Array }> {
  const out: Array<{ number: number; wire: number; value: number | Uint8Array }> = []
  let index = 0
  while (index < data.length) {
    const [key, next] = readVarint(data, index); index = next
    const number = Math.floor(key / 8), wire = key % 8
    if (wire === 0) {
      const [value, end] = readVarint(data, index); index = end; out.push({ number, wire, value })
    } else if (wire === 2) {
      const [length, bodyStart] = readVarint(data, index); const end = bodyStart + length
      if (end > data.length) throw new Error("重置权益字段不完整")
      out.push({ number, wire, value: data.subarray(bodyStart, end) }); index = end
    } else if (wire === 1) index += 8
    else if (wire === 5) index += 4
    else throw new Error(`不支持的重置权益 wire type ${wire}`)
  }
  return out
}
function parseTimestamp(data: Uint8Array): string | null {
  const seconds = protobufFields(data).find(field => field.number === 1 && field.wire === 0)?.value
  if (typeof seconds !== "number" || seconds <= 0) return null
  const ms = seconds * 1000
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
function parseRemainingResetsFrame(bytes: Uint8Array): ResetCreditsSummary {
  if (bytes.length < 5) throw new Error("重置权益 gRPC 帧不完整")
  if (bytes[0] !== 0) throw new Error("暂不支持压缩的重置权益响应")
  const messageLength = bytes[1] * 2 ** 24 + bytes[2] * 2 ** 16 + bytes[3] * 2 ** 8 + bytes[4]
  if (bytes.length < 5 + messageLength) throw new Error("重置权益 gRPC 消息不完整")
  const message = bytes.subarray(5, 5 + messageLength)
  const entries = protobufFields(message).filter(field => field.number === 10 && field.wire === 2 && field.value instanceof Uint8Array)
  const expirations: string[] = []
  for (const entry of entries) {
    // field 10 是敏感兑换 Token：只按存在性跳过，永不转换、缓存或记录。
    const expiresField = protobufFields(entry.value as Uint8Array).find(field => field.number === 30 && field.wire === 2)?.value
    const expiresAt = expiresField instanceof Uint8Array ? parseTimestamp(expiresField) : null
    if (expiresAt) expirations.push(expiresAt)
  }
  return { available: entries.length, expirations: expirations.sort() }
}
async function requestRemainingResets(token: string, userId: string | null): Promise<ResetCreditsSummary> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-version": "grok-usage-scripting/1.5.1",
    "Content-Type": "application/grpc+proto",
    Accept: "application/grpc",
    TE: "trailers",
  }
  if (userId) headers["x-userid"] = userId
  const response = await fetch(REMAINING_RESETS_URL, {
    method: "POST", headers, body: new Uint8Array(5).buffer, timeout: 20,
    debugLabel: "GrokRemainingResets",
  })
  if (!response.ok) throw new Error(`重置权益请求失败 HTTP ${response.status}`)
  const bytes = await response.bytes()
  try { return parseRemainingResetsFrame(bytes) }
  finally { bytes.fill(0) }
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
  const resetRaw = period?.end ?? config.billingPeriodEnd
  const reset = isoDate(resetRaw)
  const productUsage = Array.isArray(config.productUsage) ? config.productUsage : []
  const grokBuildUsage = productUsage
    .map(item => asObject(item))
    .find(item => {
      const product = typeof item?.product === "string" ? item.product.toLowerCase().replace(/[^a-z0-9]/g, "") : ""
      return product === "grokbuild" || product === "productgrokbuild" || product === "grokcode"
    })
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
function recent(cache: UsageSnapshot | null): boolean {
  if (!cache?.fetchedAt) return false
  const fetchedAt = new Date(cache.fetchedAt).getTime()
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < MIN_LIVE_INTERVAL_MS
}
function recoverRecentCache(profileId: string, force: boolean, reason: string): UsageResult | null {
  if (force) return null
  const latest = readCache(profileId)
  if (!recent(latest)) return null
  debug("cache.recover", { reason, fetchedAt: latest!.fetchedAt })
  return { ok: true, snapshot: latest! }
}

export async function fetchUsage(options?: { force?: boolean; profileId?: string | null }): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId)
  if (!profile) return { ok: false, error: { code: "missing_token", message: "未找到指定账号" }, cache: null }
  const cache = readCache(profile.id)
  const userId = getProfileAccountId(profile.id)
  const cacheIsRecent = recent(cache)
  debug("fetch.start", { force: Boolean(options?.force), hasCache: Boolean(cache), cacheFetchedAt: cache?.fetchedAt || null, cacheIsRecent, hasUserId: Boolean(userId) })
  if (!options?.force && cacheIsRecent) {
    debug("cache.hit", { fetchedAt: cache!.fetchedAt })
    return { ok: true, snapshot: cache! }
  }
  let token = await refreshOAuthToken(profile.id, Boolean(options?.force && !cache))
  if (!token) token = getProfileAccessToken(profile.id)
  if (!token) return { ok: false, error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` }, cache }
  try {
    // 每周 Credits 是唯一核心数据源；旧月度 Billing 与重置权益均为可选辅助请求。
    const startMonthlyCompat = (accessToken: string) => requestBilling(accessToken, userId)
      .then(async response => {
        if (!response.ok) throw new Error(`旧月度兼容请求失败 HTTP ${response.status}`)
        const payload = asObject(JSON.parse(await response.text()))
        return payload ? parseMonthly(payload) : null
      })
      .catch(error => {
        debug("monthly.compat_error", { message: error instanceof Error ? error.message : String(error) })
        return null
      })
    const startResets = (accessToken: string) => requestRemainingResets(accessToken, userId)
      .then(summary => ({ summary, error: null as unknown }))
      .catch(error => ({ summary: null, error }))
    let monthlyPromise = startMonthlyCompat(token)
    let resetPromise = startResets(token)

    let weeklyResponse = await requestBilling(token, userId, true)
    if (weeklyResponse.status === 401) {
      const refreshedToken = await refreshOAuthToken(profile.id, true)
      debug("auth.retry", { endpoint: "weekly", status: 401, refreshed: Boolean(refreshedToken) })
      if (refreshedToken) {
        token = refreshedToken
        // 辅助请求也必须使用新 Token，避免旧 Token 的 401 结果覆盖有效缓存。
        monthlyPromise = startMonthlyCompat(token)
        resetPromise = startResets(token)
        weeklyResponse = await requestBilling(token, userId, true)
      }
    }
    if (!weeklyResponse.ok) {
      const unauthorized = weeklyResponse.status === 401 || weeklyResponse.status === 403
      debug("http.error", { endpoint: "weekly", status: weeklyResponse.status, unauthorized })
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force), `weekly_http_${weeklyResponse.status}`)
      if (recovered) return recovered
      return { ok: false, error: { code: unauthorized ? "unauthorized" : "http_error", message: unauthorized ? "Grok 授权无效或当前账号没有用量权限" : `Grok 每周额度请求失败 HTTP ${weeklyResponse.status}` }, cache: readCache(profile.id) || cache }
    }
    let weekly: LimitWindow | null = null
    try { weekly = parseWeekly(asObject(JSON.parse(await weeklyResponse.text())) || {}) } catch { /* handled below */ }
    if (!weekly) {
      debug("weekly.error", { reason: "invalid_or_missing_fields" })
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force), "weekly_invalid_payload")
      if (recovered) return recovered
      return { ok: false, error: { code: "invalid_json", message: "每周额度响应字段不完整" }, cache: readCache(profile.id) || cache }
    }
    const weeklySource = "live" as const

    const resetResult = await resetPromise
    const liveResetCredits = resetResult.summary
    const resetCreditsAvailable = liveResetCredits?.available ?? cache?.resetCreditsAvailable ?? null
    const resetCreditExpirations = liveResetCredits?.expirations ?? cache?.resetCreditExpirations ?? []
    if (!liveResetCredits) {
      debug("resets.error", {
        message: resetResult.error instanceof Error ? resetResult.error.message : String(resetResult.error),
        hasCache: cache?.resetCreditsAvailable != null,
      })
    }
    const monthly = await monthlyPromise
    const windows = [weekly]
    const cachedPlan = cache?.planLabel || cache?.planType || null
    const plan = monthly ? planFromMonthly(monthly) : cachedPlan
    const snapshot: UsageSnapshot = {
      windows, fiveHour: null, weekly, monthly,
      planType: plan, planLabel: plan,
      subscriptionExpiresAt: null,
      resetCreditsAvailable,
      resetCreditExpirations,
      fetchedAt: new Date().toISOString(), source: "live", raw: {},
    }
    writeCache(profile.id, snapshot)
    debug("fetch.success", {
      plan,
      weeklySource,
      weeklyPercent: weekly.usedPercent,
      monthlyCompat: monthly ? { used: monthly.usedValue ?? null, limit: monthly.limitValue ?? null } : null,
      resetCreditsAvailable,
      resetCreditsSource: liveResetCredits ? "live" : resetCreditsAvailable != null ? "cache" : "missing",
      resetCreditExpirations: resetCreditExpirations.length,
      fetchedAt: snapshot.fetchedAt,
    })
    return { ok: true, snapshot }
  } catch (e) {
    const recovered = recoverRecentCache(profile.id, Boolean(options?.force), "network_or_parse_error")
    if (recovered) return recovered
    const latestCache = readCache(profile.id) || cache
    debug("fetch.error", { name: e instanceof Error ? e.name : "unknown", message: e instanceof Error ? e.message : String(e), hasCache: Boolean(latestCache) })
    return { ok: false, error: { code: "network_error", message: e instanceof Error ? e.message : "网络请求失败", detail: e instanceof Error ? e.message : String(e) }, cache: latestCache }
  }
}
