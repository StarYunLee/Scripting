import { fetch } from "scripting";
import {
  getProfileAccountId,
  getProfileAccessToken,
  resolveProfile,
} from "./accounts";
import { refreshOAuthToken } from "./oauth";
import type {
  CodexCreditStatus,
  CodexSpendControl,
  LimitWindow,
  LimitWindowName,
  UsageResult,
  UsageSnapshot,
} from "./types";

const CACHE_KEY = "ai_usage_codex_cache_v1";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const RESET_CREDITS_URL =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
// 真实 Codex Desktop 抓取值：内置 Codex 核心版本 + 系统信息 + Desktop App 版本。
const CODEX_DESKTOP_USER_AGENT =
  "Codex Desktop/0.147.0-alpha.6.5 (Mac OS 27.0.0; arm64) unknown (Codex Desktop; 26.803.61601)";
const CODEX_DESKTOP_ORIGINATOR = "Codex Desktop";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v)))
    return Number(v);
  return null;
}
function toBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function toStringValue(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
function epoch(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v === "string" && !/^\d+(\.\d+)?$/.test(v)) {
    const ms = new Date(v).getTime();
    return Number.isFinite(ms)
      ? { iso: new Date(ms).toISOString(), ms }
      : { iso: null, ms: null };
  }
  const n = toNumber(v);
  if (n == null) return { iso: null, ms: null };
  const ms = n > 1e11 ? n : n * 1000;
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}
function used(obj: Record<string, unknown>): number | null {
  const u = toNumber(obj.used_percent ?? obj.usedPercent);
  if (u != null) return clamp(u);
  const r = toNumber(
    obj.percent_left ?? obj.remaining_percent ?? obj.remainingPercent,
  );
  return r == null ? null : clamp(100 - r);
}
function inferName(seconds: number | null, text = ""): LimitWindowName {
  const s = text.toLowerCase();
  if (/5\s*h|five|session/.test(s)) return "five_hour";
  if (/30\s*d|month/.test(s)) return "monthly";
  if (/7\s*d|week/.test(s)) return "weekly";
  if (seconds == null) return "unknown";
  if (seconds <= 6 * 3600) return "five_hour";
  if (seconds >= 25 * 86400) return "monthly";
  if (seconds >= 6 * 86400) return "weekly";
  return "unknown";
}
function label(name: LimitWindowName, seconds: number | null): string {
  if (name === "five_hour") return "5 小时";
  if (name === "weekly") return "每周";
  if (name === "monthly") return "每月";
  if (seconds && seconds >= 86400) return `${Math.round(seconds / 86400)} 天`;
  return "限额";
}
function parseWindow(
  value: unknown,
  id: string,
  hint = "",
): LimitWindow | null {
  let obj = asObject(value);
  if (!obj) return null;
  if (!obj.reset_at && !obj.used_percent && asObject(obj.primary_window))
    obj = asObject(obj.primary_window)!;
  const seconds = toNumber(
    obj.limit_window_seconds ?? obj.window_seconds ?? obj.limit_window,
  );
  const name = inferName(seconds, `${id} ${hint}`);
  const reset = epoch(
    obj.reset_at ?? obj.reset_time_ms ?? obj.resetAt ?? obj.reset_time,
  );
  const usedPercent = used(obj);
  if (usedPercent == null && !reset.iso) return null;
  return {
    id,
    name,
    label: label(name, seconds),
    usedPercent,
    remainingPercent: usedPercent == null ? null : clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: seconds,
  };
}
function collectFromRateLimit(
  rate: Record<string, unknown>,
  prefix: string,
  hint = "",
): LimitWindow[] {
  const out: LimitWindow[] = [];
  const keys = [
    "primary_window",
    "primaryWindow",
    "secondary_window",
    "secondaryWindow",
    "five_hour",
    "weekly",
    "monthly",
  ];
  const seen = new Set<unknown>();
  for (const key of keys) {
    const value = rate[key];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const parsed = parseWindow(value, `${prefix}:${key}`, `${hint} ${key}`);
    if (parsed) out.push(parsed);
  }
  return out;
}
function extractWindows(payload: Record<string, unknown>): LimitWindow[] {
  const out: LimitWindow[] = [];
  const root =
    asObject(payload.rate_limit) || asObject(payload.rateLimit) || payload;
  out.push(...collectFromRateLimit(root, "codex"));
  const additional =
    payload.additional_rate_limits ?? root.additional_rate_limits;
  if (Array.isArray(additional)) {
    additional.forEach((item, i) => {
      const obj = asObject(item);
      const rate = asObject(obj?.rate_limit) || obj;
      if (rate)
        out.push(
          ...collectFromRateLimit(
            rate,
            `extra${i}`,
            String(obj?.limit_name || obj?.metered_feature || ""),
          ),
        );
    });
  }
  const direct: Array<[string, LimitWindowName]> = [
    ["five_hour", "five_hour"],
    ["weekly", "weekly"],
    ["monthly", "monthly"],
  ];
  for (const [key, name] of direct) {
    const parsed = parseWindow(payload[key], `direct:${key}`, key);
    if (parsed && !out.some((x) => x.name === name)) out.push(parsed);
  }
  const unique: LimitWindow[] = [];
  for (const w of out) {
    if (
      !unique.some(
        (x) =>
          x.name === w.name &&
          x.resetAtMs === w.resetAtMs &&
          x.usedPercent === w.usedPercent,
      )
    )
      unique.push(w);
  }
  return unique.sort(
    (a, b) => (a.windowSeconds || 1e20) - (b.windowSeconds || 1e20),
  );
}
function planLabel(rawPlanType: string | null): string | null {
  const raw = rawPlanType?.toLowerCase().trim() || null;
  if (!raw) return null;
  const labels: Record<string, string> = {
    guest: "Guest",
    free: "Free",
    go: "Go",
    plus: "Plus",
    pro: "Pro",
    chatgptpro: "Pro",
    chatgpt_pro: "Pro",
    prolite: "Pro Lite",
    free_workspace: "Free Workspace",
    team: "Team",
    self_serve_business_prolite: "Business Pro Lite",
    self_serve_business_usage_based: "Business",
    business: "Business",
    ent26: "Enterprise",
    enterprise_cbp_automation: "Enterprise",
    enterprise_cbp_usage_based: "Enterprise",
    enterprise: "Enterprise",
    education: "Education",
    edu: "Education",
    edu_plus: "Education Plus",
    edu_pro: "Education Pro",
    quorum: "Quorum",
    k12: "Education",
  };
  return (
    labels[raw] ||
    raw.replace(/(^|_)(\w)/g, (_, __, c) => ` ${c.toUpperCase()}`).trim()
  );
}

/** JWT https://api.openai.com/auth.chatgpt_plan_type，usage 缺 plan_type 时回退。 */
function planTypeFromAccessToken(token: string | null): string | null {
  if (!token) return null;
  try {
    let raw = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!raw) return null;
    while (raw.length % 4) raw += "=";
    const json = decodeURIComponent(
      Array.from(atob(raw))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const payload = asObject(JSON.parse(json));
    if (!payload) return null;
    const auth = asObject(payload["https://api.openai.com/auth"]);
    const value =
      toStringValue(payload.chatgpt_plan_type) ||
      toStringValue(auth?.chatgpt_plan_type) ||
      toStringValue(auth?.plan_type);
    return value;
  } catch {
    return null;
  }
}
function parseCreditStatus(
  payload: Record<string, unknown>,
): CodexCreditStatus | null {
  const credits = asObject(payload.credits);
  if (!credits) return null;
  const hasCredits = toBoolean(credits.has_credits);
  const unlimited = toBoolean(credits.unlimited);
  if (hasCredits == null || unlimited == null) return null;
  return {
    hasCredits,
    unlimited,
    balance: toStringValue(credits.balance),
  };
}
function parseSpendControl(
  payload: Record<string, unknown>,
): CodexSpendControl | null {
  const spendControl = asObject(payload.spend_control);
  if (!spendControl) return null;
  const rawLimit = asObject(spendControl.individual_limit);
  const reset = epoch(rawLimit?.reset_at);
  const individualLimit = rawLimit
    ? {
        source: toStringValue(rawLimit.source),
        limit: toStringValue(rawLimit.limit),
        used: toStringValue(rawLimit.used),
        remaining: toStringValue(rawLimit.remaining),
        usedPercent: toNumber(rawLimit.used_percent),
        remainingPercent: toNumber(rawLimit.remaining_percent),
        resetAt: reset.iso,
      }
    : null;
  return {
    reached: toBoolean(spendControl.reached),
    individualLimit,
  };
}
function rateLimitStatus(payload: Record<string, unknown>): {
  allowed: boolean | null;
  reached: boolean | null;
  reachedType: string | null;
} {
  const rateLimit = asObject(payload.rate_limit) || asObject(payload.rateLimit);
  const reachedType = asObject(payload.rate_limit_reached_type);
  return {
    allowed: toBoolean(rateLimit?.allowed),
    reached: toBoolean(rateLimit?.limit_reached),
    reachedType: toStringValue(reachedType?.type),
  };
}
type ResetCreditsInfo = {
  count: number | null;
  expirations: string[];
  container: "snake" | "camel" | "root" | "missing";
  valueKey: "snake" | "camel" | "missing";
};
function resetCreditsInfo(
  payload: Record<string, unknown> | null,
): ResetCreditsInfo {
  if (!payload)
    return {
      count: null,
      expirations: [],
      container: "missing",
      valueKey: "missing",
    };
  const snake = asObject(payload.rate_limit_reset_credits);
  const camel = asObject(payload.rateLimitResetCredits);
  const container = snake || camel || payload;
  const containerName = snake ? "snake" : camel ? "camel" : "root";
  const snakeValue = container.available_count;
  const camelValue = container.availableCount;
  const value = toNumber(snakeValue ?? camelValue);
  const collections = [
    container.credits,
    container.items,
    container.reset_credits,
    container.resetCredits,
  ];
  const entries = collections.find(Array.isArray) as unknown[] | undefined;
  const expirations = (entries || [])
    .map((item) => {
      const object = asObject(item);
      const status =
        typeof object?.status === "string"
          ? object.status.toLowerCase()
          : "available";
      if (status !== "available") return null;
      return epoch(
        object?.expires_at ??
          object?.expiresAt ??
          object?.expiration_at ??
          object?.expirationAt,
      ).iso;
    })
    .filter((item): item is string => Boolean(item))
    .sort();
  return {
    count: value == null ? null : Math.max(0, Math.floor(value)),
    expirations,
    container: containerName,
    valueKey:
      snakeValue != null ? "snake" : camelValue != null ? "camel" : "missing",
  };
}
async function fetchResetCredits(
  token: string,
  accountId: string | null,
): Promise<ResetCreditsInfo | null> {
  try {
    const response = await fetch(RESET_CREDITS_URL, {
      method: "GET",
      headers: authHeaders(token, accountId),
      timeout: 12,
      debugLabel: "CodexResetCredits",
    });
    if (!response.ok) {
      return null;
    }
    const payload = asObject(JSON.parse(await response.text()));
    return payload ? resetCreditsInfo(payload) : null;
  } catch (error) {
    return null;
  }
}
function authHeaders(
  token: string,
  accountId: string | null,
): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": CODEX_DESKTOP_USER_AGENT,
    originator: CODEX_DESKTOP_ORIGINATOR,
  };
  if (accountId) h["ChatGPT-Account-Id"] = accountId;
  return h;
}
function cacheKey(profileId: string): string {
  return `${CACHE_KEY}_${profileId}`;
}
function readCache(profileId?: string | null): UsageSnapshot | null {
  const profile = resolveProfile(profileId);
  if (!profile) return null;
  try {
    const v = Storage.get<UsageSnapshot>(cacheKey(profile.id));
    return v?.fetchedAt ? { ...v, source: "cache" } : null;
  } catch {
    return null;
  }
}
function writeCache(profileId: string, v: UsageSnapshot): void {
  try {
    Storage.set(cacheKey(profileId), { ...v, source: "cache" });
  } catch {
    /* ignore */
  }
}
export const getCachedUsage = (profileId?: string | null) =>
  readCache(profileId);
export function clearUsageCache(profileId?: string | null): void {
  const profile = resolveProfile(profileId);
  if (!profile) return;
  try {
    Storage.remove(cacheKey(profile.id));
  } catch {
    /* ignore */
  }
}

export function pickFocusWindow(
  snapshot: UsageSnapshot,
  focus: "weekly" | "five_hour" | "monthly" = "weekly",
): LimitWindow | null {
  return snapshot.windows.find((w) => w.name === focus) || null;
}
function recent(cache: UsageSnapshot | null): boolean {
  if (!cache?.fetchedAt) return false;
  const fetchedAt = new Date(cache.fetchedAt).getTime();
  return (
    Number.isFinite(fetchedAt) && Date.now() - fetchedAt < MIN_LIVE_INTERVAL_MS
  );
}
function recoverRecentCache(
  profileId: string,
  force: boolean,
): UsageResult | null {
  if (force) return null;
  const latest = readCache(profileId);
  if (!recent(latest)) return null;
  return { ok: true, snapshot: latest! };
}

export async function fetchUsage(options?: {
  force?: boolean;
  profileId?: string | null;
}): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId);
  if (!profile)
    return {
      ok: false,
      error: { code: "missing_token", message: "未找到指定账号" },
      cache: null,
    };
  const cache = readCache(profile.id);
  const accountId = getProfileAccountId(profile.id);
  const cacheIsRecent = recent(cache);
  if (!options?.force && cacheIsRecent) {
    return { ok: true, snapshot: cache! };
  }
  let token = await refreshOAuthToken(
    profile.id,
    Boolean(options?.force && !cache),
  );
  if (!token) token = getProfileAccessToken(profile.id);
  if (!token)
    return {
      ok: false,
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未授权`,
      },
      cache,
    };
  try {
    let response = await fetch(USAGE_URL, {
      method: "GET",
      headers: authHeaders(token, accountId),
      timeout: 20,
      debugLabel: "CodexUsage",
    });
    if (response.status === 401) {
      const refreshedToken = await refreshOAuthToken(profile.id, true);
      if (refreshedToken) {
        token = refreshedToken;
        response = await fetch(USAGE_URL, {
          method: "GET",
          headers: authHeaders(token, accountId),
          timeout: 20,
          debugLabel: "CodexUsageRetry",
        });
      }
    }
    const text = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = asObject(JSON.parse(text));
    } catch {
      /* handled below */
    }
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      const latestCache = readCache(profile.id) || cache;
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "http_error",
          message: unauthorized
            ? "登录已失效，请重新登录"
            : `请求失败 HTTP ${response.status}`,
        },
        cache: latestCache,
      };
    }
    if (!payload) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: { code: "invalid_json", message: "用量响应不是合法 JSON" },
        cache: readCache(profile.id) || cache,
      };
    }

    const windows = extractWindows(payload);
    if (!windows.length) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: { code: "invalid_json", message: "用量响应中没有可用额度窗口" },
        cache: readCache(profile.id) || cache,
      };
    }
    const rawPlanType =
      toStringValue(payload.plan_type) || planTypeFromAccessToken(token);
    const creditStatus = parseCreditStatus(payload);
    const spendControl = parseSpendControl(payload);
    const status = rateLimitStatus(payload);
    const embeddedResetCredits = resetCreditsInfo(payload);
    const detailedResetCredits = await fetchResetCredits(token, accountId);
    const liveResetCredits =
      detailedResetCredits?.count ?? embeddedResetCredits.count;
    const liveResetExpirations =
      detailedResetCredits != null
        ? detailedResetCredits.expirations
        : embeddedResetCredits.expirations;
    const resetCreditsAvailable =
      liveResetCredits ?? cache?.resetCreditsAvailable ?? null;
    const resetCreditExpirations =
      detailedResetCredits != null || embeddedResetCredits.count != null
        ? liveResetExpirations
        : (cache?.resetCreditExpirations ?? []);
    const resolvedPlanLabel =
      planLabel(rawPlanType) || cache?.planLabel || cache?.planType || null;
    const snapshot: UsageSnapshot = {
      windows,
      fiveHour: windows.find((w) => w.name === "five_hour") || null,
      weekly: windows.find((w) => w.name === "weekly") || null,
      monthly: windows.find((w) => w.name === "monthly") || null,
      planType: rawPlanType,
      planLabel: resolvedPlanLabel,
      creditStatus,
      spendControl,
      rateLimitAllowed: status.allowed,
      rateLimitReached: status.reached,
      rateLimitReachedType: status.reachedType,
      resetCreditsAvailable,
      resetCreditExpirations,
      fetchedAt: new Date().toISOString(),
      source: "live",
    };
    writeCache(profile.id, snapshot);
    return { ok: true, snapshot };
  } catch (e) {
    const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
    if (recovered) return recovered;
    const latestCache = readCache(profile.id) || cache;
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "网络请求失败",
        detail: e instanceof Error ? e.message : String(e),
      },
      cache: latestCache,
    };
  }
}
