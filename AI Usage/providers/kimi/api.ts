import { fetch } from "scripting";
import {
  getProfileAccessToken,
  resolveProfile,
} from "./accounts";
import { kimiRequestHeaders, refreshOAuthToken } from "./oauth";
import { formatPlanLabel } from "./format";
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types";

const USAGE_URL = "https://api.kimi.com/coding/v1/usages";
const CACHE_KEY = "ai_usage_kimi_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isoDate(value: unknown): { iso: string | null; ms: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) && ms > 0
      ? { iso: new Date(ms).toISOString(), ms }
      : { iso: null, ms: null };
  }
  if (typeof value !== "string" || !value.trim()) return { iso: null, ms: null };
  const trimmed = value.trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const raw = Number(trimmed);
    const ms = trimmed.length <= 10 ? raw * 1000 : raw;
    return Number.isFinite(ms) && ms > 0
      ? { iso: new Date(ms).toISOString(), ms }
      : { iso: null, ms: null };
  }
  const ms = new Date(trimmed).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}

function getResetTime(record: Record<string, unknown>): {
  iso: string | null;
  ms: number | null;
} {
  for (const key of [
    "resetTime",
    "reset_time",
    "resetAt",
    "reset_at",
    "resetsAt",
    "resets_at",
    "nextResetTime",
    "next_reset_time",
  ]) {
    const reset = isoDate(record[key]);
    if (reset.iso) return reset;
  }
  return { iso: null, ms: null };
}

function quotaPercents(detail: Record<string, unknown> | null): {
  usedPercent: number | null;
  remainingPercent: number | null;
} {
  if (!detail) return { usedPercent: null, remainingPercent: null };
  const limit = toNumber(detail.limit);
  const used = toNumber(detail.used);
  const remaining = toNumber(detail.remaining);
  if (limit != null && limit > 0) {
    const usedValue =
      used != null ? used : remaining != null ? limit - remaining : null;
    if (usedValue != null) {
      const usedPercent = clamp((usedValue / limit) * 100);
      return {
        usedPercent,
        remainingPercent: clamp(100 - usedPercent),
      };
    }
  }
  return { usedPercent: null, remainingPercent: null };
}

function windowSecondsFromDescriptor(window: Record<string, unknown> | null): number | null {
  if (!window) return null;
  const duration = toNumber(window.duration);
  const unit = String(window.timeUnit ?? window.time_unit ?? "").toUpperCase();
  if (duration == null || duration <= 0) return null;
  if (unit.includes("HOUR")) return duration * 3600;
  if (unit.includes("MINUTE")) return duration * 60;
  if (unit.includes("DAY")) return duration * 86400;
  if (unit.includes("WEEK")) return duration * 7 * 86400;
  return null;
}

function fiveHourLabel(window: Record<string, unknown> | null): string {
  const seconds = windowSecondsFromDescriptor(window);
  if (seconds == null) return "5 小时";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 5 ? "5 小时" : `${hours} 小时`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return "5 小时";
}

function parseMembership(payload: Record<string, unknown>): string | null {
  const user = asObject(payload.user);
  const membership = asObject(user?.membership);
  const level =
    typeof membership?.level === "string"
      ? membership.level
      : typeof payload.membership === "string"
        ? payload.membership
        : null;
  return formatPlanLabel(level);
}

function parseUsages(payload: Record<string, unknown>): {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planLabel: string | null;
} | null {
  const windows: LimitWindow[] = [];
  let fiveHour: LimitWindow | null = null;
  let weekly: LimitWindow | null = null;

  const usage = asObject(payload.usage);
  if (usage) {
    const percents = quotaPercents(usage);
    if (percents.usedPercent != null) {
      const reset = getResetTime(usage);
      weekly = {
        id: "kimi:weekly",
        name: "weekly",
        label: "每周",
        usedPercent: percents.usedPercent,
        remainingPercent: percents.remainingPercent,
        resetAt: reset.iso,
        resetAtMs: reset.ms,
        windowSeconds: 7 * 86400,
      };
      windows.push(weekly);
    }
  }

  const limits = Array.isArray(payload.limits) ? payload.limits : [];
  for (const [index, item] of limits.entries()) {
    const itemRecord = asObject(item);
    if (!itemRecord) continue;
    const detail = asObject(itemRecord.detail) || itemRecord;
    const windowDesc = asObject(itemRecord.window);
    const percents = quotaPercents(detail);
    // 新窗口可能只有 window 描述、没有用量字段 → 视为 0%。
    const usedPercent =
      percents.usedPercent != null
        ? percents.usedPercent
        : windowDesc
          ? 0
          : null;
    if (usedPercent == null) continue;
    const reset = getResetTime(detail);
    const window: LimitWindow = {
      id: `kimi:limit_${index}`,
      name: index === 0 ? "five_hour" : "unknown",
      label: index === 0 ? fiveHourLabel(windowDesc) : `窗口 ${index + 1}`,
      usedPercent,
      remainingPercent: clamp(100 - usedPercent),
      resetAt: reset.iso,
      resetAtMs: reset.ms,
      windowSeconds: windowSecondsFromDescriptor(windowDesc),
    };
    windows.push(window);
    if (index === 0) fiveHour = window;
  }

  if (!windows.length) return null;
  // 展示顺序：5 小时在前，每周在后。
  windows.sort((a, b) => {
    const rank = (name: LimitWindow["name"]) =>
      name === "five_hour" ? 0 : name === "weekly" ? 1 : 2;
    return rank(a.name) - rank(b.name);
  });
  return {
    windows,
    fiveHour,
    weekly,
    planLabel: parseMembership(payload),
  };
}

function cacheKey(profileId: string): string {
  return `${CACHE_KEY}_${profileId}`;
}

function readCache(profileId?: string | null): UsageSnapshot | null {
  const profile = resolveProfile(profileId);
  if (!profile) return null;
  try {
    const value = Storage.get<UsageSnapshot>(cacheKey(profile.id));
    return value?.fetchedAt ? { ...value, source: "cache" } : null;
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

export const getCachedUsage = (profileId?: string | null) => readCache(profileId);

export function clearUsageCache(profileId?: string | null): void {
  const profile = resolveProfile(profileId);
  if (!profile) return;
  try {
    Storage.remove(cacheKey(profile.id));
  } catch {
    /* ignore */
  }
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
  if (!options?.force && recent(cache)) return { ok: true, snapshot: cache! };

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
      headers: kimiRequestHeaders(token),
      timeout: 20,
      debugLabel: "KimiUsages",
    });
    if (response.status === 401) {
      const refreshed = await refreshOAuthToken(profile.id, true);
      if (refreshed) {
        token = refreshed;
        response = await fetch(USAGE_URL, {
          method: "GET",
          headers: kimiRequestHeaders(token),
          timeout: 20,
          debugLabel: "KimiUsagesRetry",
        });
      }
    }

    if (!response.ok) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      const unauthorized = response.status === 401 || response.status === 403;
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "http_error",
          message: unauthorized
            ? "Kimi 授权无效或已过期，请重新登录"
            : `Kimi 用量请求失败（HTTP ${response.status}）`,
          status: response.status,
        },
        cache: readCache(profile.id) || cache,
      };
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = asObject(JSON.parse(await response.text()));
    } catch {
      /* handled below */
    }
    const parsed = payload ? parseUsages(payload) : null;
    if (!parsed) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Kimi 用量响应字段不完整或当前账号无可用额度",
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const snapshot: UsageSnapshot = {
      windows: parsed.windows,
      fiveHour: parsed.fiveHour,
      weekly: parsed.weekly,
      planType: parsed.planLabel,
      planLabel: parsed.planLabel,
      fetchedAt: new Date().toISOString(),
      source: "live",
    };
    writeCache(profile.id, snapshot);
    return { ok: true, snapshot };
  } catch (error) {
    const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
    if (recovered) return recovered;
    return {
      ok: false,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "网络请求失败",
        detail: error instanceof Error ? error.message : String(error),
      },
      cache: readCache(profile.id) || cache,
    };
  }
}
