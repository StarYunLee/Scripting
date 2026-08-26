import { fetch } from "scripting";
import { PERIOD } from "../../copy/labels";
import {
  getProfileAccessToken,
  getProfileRegion,
  resolveProfile,
  saveProfileCredentials,
} from "./accounts";
import { formatPlanLabel, inferPlanFromLimit } from "./format";
import { quotaUrls, refreshOAuthToken, minimaxRequestHeaders } from "./oauth";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
  MinimaxRegion,
} from "./types";

const CACHE_KEY = "ai_usage_minimax_cache_v1";
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

/** MiniMax 的 *_usage_count 实际表示剩余量（字段名误导）。 */
function remainingFromCounts(
  total: number | null,
  remainingOrMisnamed: number | null,
  remainingAlias: number | null,
): number | null {
  if (remainingAlias != null) return Math.max(0, remainingAlias);
  if (total != null && remainingOrMisnamed != null) {
    // 若 misnamed 接近 total，视为 remaining；否则也当作 remaining（官方行为）
    return Math.max(0, remainingOrMisnamed);
  }
  return remainingOrMisnamed;
}

function resetFromRow(
  endTime: unknown,
  remainsTime: unknown,
): { iso: string | null; ms: number | null } {
  const endMs = toNumber(endTime);
  if (endMs != null && endMs > 0) {
    const ms = endMs < 1e12 ? endMs * 1000 : endMs;
    return { iso: new Date(ms).toISOString(), ms };
  }
  const remainMs = toNumber(remainsTime);
  if (remainMs != null && remainMs > 0) {
    const ms = Date.now() + remainMs;
    return { iso: new Date(ms).toISOString(), ms };
  }
  return { iso: null, ms: null };
}

function pickPrimaryRow(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!rows.length) return null;
  const score = (row: Record<string, unknown>) => {
    const name = String(row.model_name || row.modelName || "").toLowerCase();
    if (/minimax-m|m\d|general|text|coding/.test(name)) return 3;
    if (/image|video|speech|voice/.test(name)) return 0;
    return 1;
  };
  return [...rows].sort((a, b) => score(b) - score(a))[0] || null;
}

function parseRemains(payload: Record<string, unknown>): {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planLabel: string | null;
  intervalTotal: number | null;
} | null {
  const base = asObject(payload.base_resp);
  const statusCode = toNumber(base?.status_code);
  if (statusCode != null && statusCode !== 0) return null;

  const rowsRaw = Array.isArray(payload.model_remains)
    ? payload.model_remains
    : Array.isArray(asObject(payload.data)?.model_remains)
      ? (asObject(payload.data)!.model_remains as unknown[])
      : [];
  const rows = rowsRaw
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const row = pickPrimaryRow(rows);
  if (!row) return null;

  const intervalTotal = toNumber(row.current_interval_total_count);
  const intervalRemaining = remainingFromCounts(
    intervalTotal,
    toNumber(row.current_interval_usage_count),
    toNumber(row.current_interval_remaining_count) ??
      toNumber(row.current_interval_remains_count),
  );
  const intervalRemainPct = toNumber(row.current_interval_remaining_percent);

  const weeklyTotal = toNumber(row.current_weekly_total_count);
  const weeklyRemaining = remainingFromCounts(
    weeklyTotal,
    toNumber(row.current_weekly_usage_count),
    toNumber(row.current_weekly_remaining_count) ??
      toNumber(row.current_weekly_remains_count),
  );
  const weeklyRemainPct = toNumber(row.current_weekly_remaining_percent);

  const intervalReset = resetFromRow(row.end_time, row.remains_time);
  const weeklyReset = resetFromRow(
    row.weekly_end_time,
    row.weekly_remains_time ?? row.remains_time,
  );

  let fiveHour: LimitWindow | null = null;
  let weekly: LimitWindow | null = null;

  if (
    (intervalTotal != null && intervalTotal > 0 && intervalRemaining != null) ||
    intervalRemainPct != null
  ) {
    const remainingPercent =
      intervalRemainPct != null
        ? clamp(intervalRemainPct)
        : intervalTotal && intervalTotal > 0 && intervalRemaining != null
          ? clamp((intervalRemaining / intervalTotal) * 100)
          : null;
    if (remainingPercent != null) {
      fiveHour = {
        id: "minimax:five_hour",
        name: "five_hour",
        label: PERIOD.FIVE_HOUR.app,
        usedPercent: clamp(100 - remainingPercent),
        remainingPercent,
        resetAt: intervalReset.iso,
        resetAtMs: intervalReset.ms,
        windowSeconds: 5 * 3600,
      };
    }
  }

  if (
    (weeklyTotal != null && weeklyTotal > 0 && weeklyRemaining != null) ||
    weeklyRemainPct != null
  ) {
    const remainingPercent =
      weeklyRemainPct != null
        ? clamp(weeklyRemainPct)
        : weeklyTotal && weeklyTotal > 0 && weeklyRemaining != null
          ? clamp((weeklyRemaining / weeklyTotal) * 100)
          : null;
    if (remainingPercent != null) {
      weekly = {
        id: "minimax:weekly",
        name: "weekly",
        label: PERIOD.WEEKLY.app,
        usedPercent: clamp(100 - remainingPercent),
        remainingPercent,
        resetAt: weeklyReset.iso,
        resetAtMs: weeklyReset.ms,
        windowSeconds: 7 * 86400,
      };
    }
  }

  const windows = [fiveHour, weekly].filter(Boolean) as LimitWindow[];
  if (!windows.length) return null;

  const planRaw =
    (typeof row.current_subscribe_title === "string" && row.current_subscribe_title) ||
    (typeof row.plan_name === "string" && row.plan_name) ||
    (typeof row.plan === "string" && row.plan) ||
    (typeof payload.current_subscribe_title === "string" &&
      payload.current_subscribe_title) ||
    null;

  return {
    windows,
    fiveHour,
    weekly,
    planLabel: formatPlanLabel(planRaw),
    intervalTotal,
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

async function requestQuota(
  token: string,
  region: MinimaxRegion,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; status: number }> {
  let lastStatus = 0;
  for (const url of quotaUrls(region)) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: minimaxRequestHeaders(token),
        timeout: 20,
        debugLabel: region === "intl" ? "MinimaxQuotaIntl" : "MinimaxQuotaCn",
      });
      lastStatus = response.status;
      if (response.status === 401 || response.status === 403)
        return { ok: false, status: response.status };
      if (!response.ok) continue;
      const text = await response.text();
      if (text.trim().startsWith("<")) continue;
      const payload = asObject(JSON.parse(text));
      if (!payload) continue;
      const base = asObject(payload.base_resp);
      const code = toNumber(base?.status_code);
      if (code != null && code !== 0) {
        lastStatus = code === 2042 || code === 1004 ? 401 : 400;
        continue;
      }
      if (!Array.isArray(payload.model_remains) && !asObject(payload.data)?.model_remains)
        continue;
      return { ok: true, payload };
    } catch {
      /* try next */
    }
  }
  return { ok: false, status: lastStatus };
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

  let token = await refreshOAuthToken(profile.id);
  if (!token) token = getProfileAccessToken(profile.id);
  if (!token)
    return {
      ok: false,
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未配置 API Key`,
      },
      cache,
    };

  try {
    const preferred = getProfileRegion(profile.id);
    const order: MinimaxRegion[] =
      preferred === "cn" ? ["cn", "intl"] : ["intl", "cn"];
    let payload: Record<string, unknown> | null = null;
    let region: MinimaxRegion | null = null;
    let lastStatus = 0;

    for (const candidate of order) {
      const result = await requestQuota(token, candidate);
      if (result.ok) {
        payload = result.payload;
        region = candidate;
        break;
      }
      lastStatus = result.status;
    }

    if (!payload || !region) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      const unauthorized = lastStatus === 401 || lastStatus === 403;
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "http_error",
          message: unauthorized
            ? "MiniMax API Key 无效或已过期，请重新配置"
            : `MiniMax 用量请求失败（HTTP ${lastStatus || "?"}）`,
          status: lastStatus || undefined,
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const parsed = parseRemains(payload);
    if (!parsed) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "MiniMax 用量响应字段不完整或当前账号无可用额度",
        },
        cache: readCache(profile.id) || cache,
      };
    }

    if (getProfileRegion(profile.id) !== region) {
      saveProfileCredentials(profile.id, {
        accessToken: token,
        region,
      });
    }

    const planLabel =
      parsed.planLabel ||
      inferPlanFromLimit(parsed.intervalTotal, region) ||
      cache?.planLabel ||
      cache?.planType ||
      null;

    const snapshot: UsageSnapshot = {
      windows: parsed.windows,
      fiveHour: parsed.fiveHour,
      weekly: parsed.weekly,
      planType: planLabel,
      planLabel,
      region,
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
