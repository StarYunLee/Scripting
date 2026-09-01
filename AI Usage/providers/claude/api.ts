import { fetch, Response } from "scripting";
import { getProfileAccessToken, resolveProfile } from "./accounts";
import { decideClaudeFetchGate } from "./fetch-gate";
import { refreshOAuthToken } from "./oauth";
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types";
import { claudeScopedWindowTitle, claudeWindowTitle } from "./window-titles";

const CACHE_KEY = "ai_usage_claude_cache_v1";
const RATE_LIMIT_KEY = "ai_usage_claude_rate_limit_v1";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;
const DEFAULT_RATE_LIMIT_MS = 5 * 60_000;
const CLIENT_USER_AGENT = "claude-code/2.1.239";

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
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
function isoDate(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v !== "string") return { iso: null, ms: null };
  const ms = new Date(v).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}
function usageHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": CLIENT_USER_AGENT,
    "anthropic-beta": "oauth-2025-04-20",
  };
}
function makeWindow(
  id: string,
  name: LimitWindow["name"],
  label: string,
  utilization: unknown,
  resetsAt: unknown,
  seconds = 7 * 86400,
): LimitWindow | null {
  const value = toNumber(utilization);
  const reset = isoDate(resetsAt);
  if (value == null && !reset.iso) return null;
  const usedPercent = value == null ? null : clamp(value);
  return {
    id,
    name,
    label,
    usedPercent,
    remainingPercent: usedPercent == null ? null : clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: seconds,
  };
}
function parseWindow(
  payload: Record<string, unknown>,
  key: string,
  name: LimitWindow["name"],
  label: string,
  seconds: number,
): LimitWindow | null {
  const raw = asObject(payload[key]);
  if (!raw) return null;
  return makeWindow(
    `claude:${key}`,
    name,
    label,
    raw.utilization,
    raw.resets_at,
    seconds,
  );
}
function scopedLabel(value: string): string {
  return claudeScopedWindowTitle(value);
}
function scopedId(value: string, index: number): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `claude:weekly-scoped:${normalized || index}`;
}
function parseScopedLimits(payload: Record<string, unknown>): LimitWindow[] {
  if (!Array.isArray(payload.limits)) return [];
  const windows: LimitWindow[] = [];
  payload.limits.forEach((item, index) => {
    const raw = asObject(item);
    const scope = asObject(raw?.scope);
    const model = asObject(scope?.model);
    const displayName =
      typeof model?.display_name === "string" ? model.display_name.trim() : "";
    const kind = typeof raw?.kind === "string" ? raw.kind.toLowerCase() : "";
    const group = typeof raw?.group === "string" ? raw.group.toLowerCase() : "";
    if (!displayName || (kind !== "weekly_scoped" && group !== "weekly"))
      return;
    const parsed = makeWindow(
      scopedId(displayName, index),
      /fable/i.test(displayName) ? "weekly_fable" : "weekly_scoped",
      scopedLabel(displayName),
      raw?.percent,
      raw?.resets_at,
    );
    if (parsed) windows.push(parsed);
  });
  return windows;
}
function parseFlatScopedLimits(
  payload: Record<string, unknown>,
): LimitWindow[] {
  const definitions: Array<[string, string, LimitWindow["name"]]> = [
    ["seven_day_sonnet", claudeScopedWindowTitle("Sonnet"), "weekly_scoped"],
    ["seven_day_opus", claudeScopedWindowTitle("Opus"), "weekly_scoped"],
    [
      "seven_day_oauth_apps",
      claudeScopedWindowTitle("OAuth Apps"),
      "weekly_scoped",
    ],
    ["seven_day_fable", claudeWindowTitle("weekly_fable"), "weekly_fable"],
    ["seven_day_fable_5", claudeWindowTitle("weekly_fable"), "weekly_fable"],
    ["fable_seven_day", claudeWindowTitle("weekly_fable"), "weekly_fable"],
  ];
  const windows: LimitWindow[] = [];
  for (const [key, label, name] of definitions) {
    const parsed = parseWindow(payload, key, name, label, 7 * 86400);
    if (parsed) windows.push(parsed);
  }
  return windows;
}
function mergeScopedLimits(
  dynamic: LimitWindow[],
  flat: LimitWindow[],
): LimitWindow[] {
  const windows = [...dynamic];
  for (const candidate of flat) {
    const duplicate = windows.some((window) => {
      if (window.name === "weekly_fable" && candidate.name === "weekly_fable")
        return true;
      return window.label.toLowerCase() === candidate.label.toLowerCase();
    });
    if (!duplicate) windows.push(candidate);
  }
  return windows;
}
function planLabel(payload: Record<string, unknown>): string | null {
  for (const key of [
    "subscription_type",
    "rate_limit_tier",
    "plan_type",
    "plan",
  ]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      const clean = value
        .replace(/^default_claude_?/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      if (/^max\s*20x$/i.test(clean)) return "Claude Max 20×";
      if (/^max\s*5x$/i.test(clean)) return "Claude Max 5×";
      if (/^pro$/i.test(clean)) return "Claude Pro";
      if (/^team/i.test(clean)) return "Claude Team";
      return clean.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}
function cacheKey(profileId: string): string {
  return `${CACHE_KEY}_${profileId}`;
}
function rateLimitKey(profileId: string): string {
  return `${RATE_LIMIT_KEY}_${profileId}`;
}
function readBlockedUntil(profileId: string): number | null {
  try {
    const value = Storage.get<number>(rateLimitKey(profileId));
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (value <= Date.now()) {
      Storage.remove(rateLimitKey(profileId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
function writeBlockedUntil(profileId: string, value: number): void {
  try {
    Storage.set(rateLimitKey(profileId), value);
  } catch {
    /* ignore */
  }
}
function clearBlockedUntil(profileId: string): void {
  try {
    Storage.remove(rateLimitKey(profileId));
  } catch {
    /* ignore */
  }
}
function parseRetryAfter(response: Response): number {
  const raw = response.headers.get("Retry-After")?.trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Date.now() + seconds * 1000;
    const date = new Date(raw).getTime();
    if (Number.isFinite(date) && date > Date.now()) return date;
  }
  return Date.now() + DEFAULT_RATE_LIMIT_MS;
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
function writeCache(profileId: string, value: UsageSnapshot): void {
  try {
    Storage.set(cacheKey(profileId), { ...value, source: "cache" });
  } catch {
    /* ignore */
  }
}
export const getCachedUsage = (profileId?: string | null) =>
  readCache(profileId);
export function clearUsageCache(profileId?: string | null): void {
  const p = resolveProfile(profileId);
  if (!p) return;
  try {
    Storage.remove(cacheKey(p.id));
    Storage.remove(rateLimitKey(p.id));
  } catch {
    /* ignore */
  }
}
export function pickFocusWindow(
  snapshot: UsageSnapshot,
  focus: "five_hour" | "weekly" | "weekly_fable" = "five_hour",
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
async function requestUsage(token: string): Promise<Response> {
  return fetch(USAGE_URL, {
    method: "GET",
    headers: usageHeaders(token),
    timeout: 20,
    debugLabel: "ClaudeOAuthUsage",
  });
}
function errorMessage(payload: Record<string, unknown> | null): string | null {
  const error = asObject(payload?.error);
  return typeof error?.message === "string" ? error.message : null;
}

export async function fetchUsage(options?: {
  force?: boolean;
  profileId?: string | null;
}): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId);
  if (!profile) {
    return {
      ok: false,
      error: { code: "missing_token", message: "未找到指定账号" },
      cache: null,
    };
  }
  const cache = readCache(profile.id);
  const gate = decideClaudeFetchGate({
    force: Boolean(options?.force),
    cacheIsRecent: recent(cache),
    blockedUntil: readBlockedUntil(profile.id),
  });
  if (gate.action === "use_cache") {
    return { ok: true, snapshot: cache! };
  }
  if (gate.action === "rate_limited") {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: `Anthropic 用量接口限流，请在 ${new Date(gate.blockedUntil).toLocaleTimeString()} 后重试`,
        status: 429,
      },
      cache,
    };
  }

  let token = await refreshOAuthToken(profile.id);
  if (!token) token = getProfileAccessToken(profile.id);
  if (!token) {
    return {
      ok: false,
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未授权`,
      },
      cache,
    };
  }

  try {
    let response = await requestUsage(token);
    if (response.status === 401) {
      const refreshedToken = await refreshOAuthToken(profile.id, true);
      if (refreshedToken) {
        token = refreshedToken;
        response = await requestUsage(token);
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
      const rateLimited = response.status === 429;
      const retryAt = rateLimited ? parseRetryAfter(response) : null;
      if (retryAt) writeBlockedUntil(profile.id, retryAt);
      const message = unauthorized
        ? "Claude OAuth 已失效或该账号无权读取用量"
        : rateLimited
          ? "Anthropic 用量接口限流，已保留最近缓存"
          : errorMessage(payload) ||
            `Claude 用量请求失败 HTTP ${response.status}`;
      return {
        ok: false,
        error: {
          code: unauthorized
            ? "unauthorized"
            : rateLimited
              ? "rate_limited"
              : "http_error",
          message,
          status: response.status,
          retryAt: retryAt ? new Date(retryAt).toISOString() : undefined,
        },
        cache,
      };
    }
    if (!payload) {
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Claude 用量响应不是合法 JSON",
        },
        cache,
      };
    }

    const fiveHour = parseWindow(
      payload,
      "five_hour",
      "five_hour",
      claudeWindowTitle("five_hour"),
      5 * 3600,
    );
    const weekly = parseWindow(
      payload,
      "seven_day",
      "weekly",
      claudeWindowTitle("weekly"),
      7 * 86400,
    );
    const dynamicScoped = parseScopedLimits(payload);
    const flatScoped = parseFlatScopedLimits(payload);
    const scopedWeekly = mergeScopedLimits(dynamicScoped, flatScoped);
    const weeklyFable =
      scopedWeekly.find((window) => window.name === "weekly_fable") || null;
    const windows = [fiveHour, weekly, ...scopedWeekly].filter(
      (window): window is LimitWindow => Boolean(window),
    );
    if (!fiveHour && !weekly && scopedWeekly.length === 0) {
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Claude 用量响应中没有可识别的额度窗口",
        },
        cache,
      };
    }

    const plan =
      planLabel(payload) || cache?.planLabel || cache?.planType || "Claude";
    const snapshot: UsageSnapshot = {
      windows,
      fiveHour,
      weekly,
      weeklyFable,
      scopedWeekly,
      planType: plan,
      planLabel: plan,
      fetchedAt: new Date().toISOString(),
      source: "live",
    };
    clearBlockedUntil(profile.id);
    writeCache(profile.id, snapshot);
    return { ok: true, snapshot };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: e instanceof Error ? e.message : "网络请求失败",
        detail: e instanceof Error ? e.message : String(e),
      },
      cache,
    };
  }
}
