import {
  getProfileAccessToken,
  getProfileRefreshToken,
  getProfileTokenExpiresAt,
  listAccounts,
  resolveProfile,
} from "./accounts"
import { getEffectiveSettings, getSettings } from "./credentials"
import type { UsageResult, UsageSnapshot } from "./types"

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}
declare const Device: {
  model?: string
  systemName?: string
  systemVersion?: string
  isiPhone?: boolean
  isiPad?: boolean
}
declare const Script: {
  env?: string
  metadata?: { version?: string; name?: string }
}

const EVENTS_KEY = "claude_usage_diag_events_v1"
const LAST_PROBE_KEY = "claude_usage_diag_last_probe_v1"
const MAX_EVENTS = 24

export type DiagnosticEvent = {
  at: string
  event: string
  data: Record<string, unknown>
}

export type UsageProbe = {
  at: string
  profileId: string | null
  force: boolean
  ok: boolean
  fromCacheOnly: boolean
  errorCode: string | null
  errorMessage: string | null
  httpStatus: number | null
  emptyWindows: boolean | null
  windowCount: number | null
  planLabel: string | null
  source: "live" | "cache" | null
  hasCache: boolean
  cacheFetchedAt: string | null
  clientUserAgent: string
  endpoint: string
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function safeString(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
  if (!clean) return null
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/** 脱敏邮箱：保留本地前 2 位与域名。 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null
  const [local, domain] = email.split("@")
  if (!local || !domain) return null
  const head = local.slice(0, Math.min(2, local.length))
  return `${head}***@${domain}`
}

/** 脱敏 profileId：只保留尾部。 */
export function maskProfileId(profileId: string | null | undefined): string | null {
  if (!profileId) return null
  if (profileId.length <= 10) return profileId
  return `…${profileId.slice(-8)}`
}

function readEvents(): DiagnosticEvent[] {
  try {
    const value = Storage.get<unknown>(EVENTS_KEY)
    if (!Array.isArray(value)) return []
    return value
      .map((item): DiagnosticEvent | null => {
        const object = asObject(item)
        if (!object) return null
        const at = safeString(object.at)
        const event = safeString(object.event, 80)
        const data = asObject(object.data) || {}
        if (!at || !event) return null
        return { at, event, data: sanitizeData(data) }
      })
      .filter((item): item is DiagnosticEvent => Boolean(item))
      .slice(-MAX_EVENTS)
  } catch {
    return []
  }
}

function writeEvents(events: DiagnosticEvent[]): void {
  try {
    Storage.set(EVENTS_KEY, events.slice(-MAX_EVENTS))
  } catch {
    /* ignore */
  }
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase()
    // 只抹真正的密钥字段；保留 refreshed / hasRefreshToken 这类布尔诊断位。
    if (
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower.includes("secret") ||
      lower.includes("cookie") ||
      lower.includes("code_verifier") ||
      lower.includes("access_token") ||
      lower.includes("refresh_token") ||
      lower.includes("id_token") ||
      lower === "token" ||
      lower === "accesstoken" ||
      lower === "refreshtoken" ||
      lower === "idtoken" ||
      (lower.endsWith("token") && !lower.startsWith("has")) // hasAccessToken 保留；xxxToken 抹掉
    ) {
      out[key] = "[redacted]"
      continue
    }
    if (lower === "email" || lower.endsWith("email")) {
      out[key] = typeof value === "string" ? maskEmail(value) : null
      continue
    }
    if (lower === "profileid" || lower === "profile_id" || lower.endsWith("profileid")) {
      out[key] = typeof value === "string" ? maskProfileId(value) : null
      continue
    }
    if (value == null || typeof value === "boolean" || typeof value === "number") {
      out[key] = value
      continue
    }
    if (typeof value === "string") {
      out[key] = safeString(value)
      continue
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 12).map((item) => {
        if (item == null || typeof item === "boolean" || typeof item === "number") return item
        if (typeof item === "string") return safeString(item, 120)
        if (asObject(item)) return sanitizeData(item as Record<string, unknown>)
        return String(item)
      })
      continue
    }
    const object = asObject(value)
    if (object) {
      out[key] = sanitizeData(object)
      continue
    }
    out[key] = String(value)
  }
  return out
}

/** 记录运行时事件（控制台 + 本机环形缓冲，不含密钥）。 */
export function noteDiagnostic(event: string, data: Record<string, unknown> = {}): void {
  const entry: DiagnosticEvent = {
    at: new Date().toISOString(),
    event,
    data: sanitizeData(data),
  }
  try {
    console.log(`[Claude Usage] ${event} ${JSON.stringify(entry.data)}`)
  } catch {
    /* ignore */
  }
  const events = readEvents()
  events.push(entry)
  writeEvents(events)
}

export function readLastUsageProbe(): UsageProbe | null {
  try {
    const value = Storage.get<UsageProbe>(LAST_PROBE_KEY)
    return value?.at ? value : null
  } catch {
    return null
  }
}

export function writeLastUsageProbe(probe: UsageProbe): void {
  try {
    Storage.set(LAST_PROBE_KEY, {
      ...probe,
      errorMessage: safeString(probe.errorMessage, 200),
      planLabel: safeString(probe.planLabel, 80),
      profileId: probe.profileId,
    })
  } catch {
    /* ignore */
  }
}

function snapshotSummary(snapshot: UsageSnapshot | null | undefined): Record<string, unknown> | null {
  if (!snapshot) return null
  return {
    source: snapshot.source,
    planLabel: snapshot.planLabel,
    fetchedAt: snapshot.fetchedAt,
    windowCount: snapshot.windows.length,
    emptyWindows: snapshot.windows.length === 0,
    windows: snapshot.windows.map((window) => ({
      name: window.name,
      usedPercent: window.usedPercent,
      remainingPercent: window.remainingPercent,
      hasResetAt: Boolean(window.resetAt),
    })),
  }
}

function deviceLine(): string {
  try {
    const model = Device?.model || "unknown"
    const systemName = Device?.systemName || "iOS"
    const systemVersion = Device?.systemVersion || "?"
    const kind = Device?.isiPad ? "iPad" : Device?.isiPhone ? "iPhone" : "device"
    return `${kind} ${model} ${systemName} ${systemVersion}`
  } catch {
    return "unknown"
  }
}

function scriptVersion(): string {
  try {
    return Script?.metadata?.version || "unknown"
  } catch {
    return "unknown"
  }
}

function scriptEnv(): string {
  try {
    return Script?.env || "unknown"
  } catch {
    return "unknown"
  }
}

function line(key: string, value: unknown): string {
  if (value == null || value === "") return `${key}: —`
  if (typeof value === "boolean") return `${key}: ${value ? "true" : "false"}`
  return `${key}: ${String(value)}`
}

/**
 * 生成可粘贴到 GitHub Issue 的脱敏诊断文本。
 * 不含 access/refresh token、authorization header、完整邮箱本地部分。
 */
export function buildDiagnosticReport(options?: {
  profileId?: string | null
  lastResult?: UsageResult | null
  cache?: UsageSnapshot | null
  clientUserAgent?: string
  endpoint?: string
}): string {
  const profile = resolveProfile(options?.profileId)
  const settings = getSettings()
  const effective = getEffectiveSettings(profile?.id)
  // 缓存由调用方传入，避免与 api.ts 形成循环依赖。
  const cache = options?.cache ?? null
  const probe = readLastUsageProbe()
  const events = readEvents().slice(-12)
  const access = profile ? Boolean(getProfileAccessToken(profile.id)) : false
  const refresh = profile ? Boolean(getProfileRefreshToken(profile.id)) : false
  const expiresAt = profile ? getProfileTokenExpiresAt(profile.id) : null
  const expiresInSec =
    expiresAt && Number.isFinite(expiresAt) ? Math.round((expiresAt - Date.now()) / 1000) : null

  const result = options?.lastResult || null
  const resultBlock = result
    ? result.ok
      ? {
          ok: true,
          ...snapshotSummary(result.snapshot),
        }
      : {
          ok: false,
          code: result.error.code,
          message: safeString(result.error.message, 200),
          status: result.error.status ?? null,
          hasCache: Boolean(result.cache),
          cache: snapshotSummary(result.cache || null),
        }
    : null

  const lines: string[] = [
    "Claude Usage Diagnostic Report",
    "请粘贴到 GitHub Issue。本报告已脱敏，不含 Token / Authorization。",
    "",
    line("generatedAt", new Date().toISOString()),
    line("version", scriptVersion()),
    line("scriptEnv", scriptEnv()),
    line("device", deviceLine()),
    line("clientUserAgent", options?.clientUserAgent || probe?.clientUserAgent || "claude-code/1.3.4"),
    line("usageEndpoint", options?.endpoint || probe?.endpoint || "https://api.anthropic.com/api/oauth/usage"),
    line("accountCount", listAccounts().length),
    "",
    "[profile]",
    line("selected", Boolean(profile)),
    line("profileId", maskProfileId(profile?.id || null)),
    line("email", maskEmail(profile?.email || null)),
    line("hasAccessToken", access),
    line("hasRefreshToken", refresh),
    line("tokenExpiresInSec", expiresInSec),
    "",
    "[settings]",
    line("reloadMinutes", settings.reloadMinutes),
    line("displayMode", effective.displayMode),
    line("widgetStyle", effective.widgetStyle),
    line("focusWindow", effective.focusWindow),
    line("dualQuotaPreset", effective.dualQuotaPreset),
    "",
    "[cache]",
    line("hasCache", Boolean(cache)),
    line("cacheFetchedAt", cache?.fetchedAt || null),
    line("cacheEmptyWindows", cache ? cache.windows.length === 0 : null),
    line("cacheWindowCount", cache ? cache.windows.length : null),
    line("cachePlanLabel", cache?.planLabel || null),
    "",
    "[lastProbe]",
  ]

  if (probe) {
    lines.push(
      line("at", probe.at),
      line("ok", probe.ok),
      line("fromCacheOnly", probe.fromCacheOnly),
      line("force", probe.force),
      line("httpStatus", probe.httpStatus),
      line("errorCode", probe.errorCode),
      line("errorMessage", probe.errorMessage),
      line("emptyWindows", probe.emptyWindows),
      line("windowCount", probe.windowCount),
      line("planLabel", probe.planLabel),
      line("source", probe.source),
      line("hasCache", probe.hasCache),
      line("cacheFetchedAt", probe.cacheFetchedAt),
      line("profileId", maskProfileId(probe.profileId)),
    )
  } else {
    lines.push("status: no probe yet")
  }

  lines.push("", "[thisRun]")
  if (resultBlock) {
    lines.push(JSON.stringify(resultBlock, null, 2))
  } else {
    lines.push("status: no result attached")
  }

  lines.push("", "[recentEvents]")
  if (!events.length) {
    lines.push("(empty)")
  } else {
    for (const item of events) {
      lines.push(`${item.at} ${item.event} ${JSON.stringify(item.data)}`)
    }
  }

  lines.push(
    "",
    "[howToRead]",
    "- httpStatus=429 + errorCode=rate_limited：仍被 Anthropic 限流，优先看 clientUserAgent 是否为 claude-code/*",
    "- emptyWindows=true 且 ok=true：空窗合法快照，UI 应显示 —，不应回退旧缓存",
    "- fromCacheOnly=true：3 分钟内命中缓存，未打 live 接口",
    "- hasAccessToken=false：账号未授权或 Keychain 丢失",
    "",
  )

  return lines.join("\n")
}
