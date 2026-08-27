import { fetch } from "scripting";
import { getProfileAccessToken, resolveProfile } from "./accounts";
import { kimiRequestHeaders, refreshOAuthToken } from "./oauth";
import {
  parseKimiMembership,
  parseKimiUsage,
} from "./usage-parser";
import { createUsageCache } from "../../services/usage-cache";
import type { UsageResult, UsageSnapshot } from "./types";

const USAGE_URL = "https://api.kimi.com/coding/v1/usages";
const ME_URL = "https://api.kimi.com/coding/v1/me";
const CACHE_KEY = "ai_usage_kimi_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const usageCache = createUsageCache<UsageSnapshot>({
  keyPrefix: `${CACHE_KEY}_`,
  resolveProfileId: (profileId) => resolveProfile(profileId)?.id || null,
  recentMs: MIN_LIVE_INTERVAL_MS,
});

export const getCachedUsage = (profileId?: string | null) =>
  usageCache.read(profileId);
export function clearUsageCache(profileId?: string | null): void {
  usageCache.clear(profileId);
}

async function fetchPlanLabel(token: string): Promise<string | null> {
  try {
    const response = await fetch(ME_URL, {
      method: "GET",
      headers: kimiRequestHeaders(token),
      timeout: 15,
      debugLabel: "KimiPlanInfo",
    });
    if (!response.ok) return null;
    const payload = asObject(JSON.parse(await response.text()));
    return payload ? parseKimiMembership(payload) : null;
  } catch {
    return null;
  }
}

async function requestUsage(token: string) {
  return fetch(USAGE_URL, {
    method: "GET",
    headers: kimiRequestHeaders(token),
    timeout: 20,
    debugLabel: "KimiUsages",
  });
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
  const cache = usageCache.read(profile.id);
  if (!options?.force && usageCache.recent(cache)) {
    return { ok: true, snapshot: cache! };
  }
  let token = await refreshOAuthToken(
    profile.id,
    Boolean(options?.force && !cache),
  );
  if (!token) token = getProfileAccessToken(profile.id);
  if (!token) {
    return {
      ok: false,
      error: { code: "missing_token", message: `账号“${profile.name}”尚未授权` },
      cache,
    };
  }
  try {
    let response = await requestUsage(token);
    if (response.status === 401 || response.status === 403) {
      const refreshed = await refreshOAuthToken(profile.id, true);
      if (refreshed) {
        token = refreshed;
        response = await requestUsage(token);
      }
    }
    if (!response.ok) {
      const recovered = usageCache.recoverRecent(
        profile.id,
        Boolean(options?.force),
      );
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
        cache: usageCache.read(profile.id) || cache,
      };
    }
    let payload: Record<string, unknown> | null = null;
    try {
      payload = asObject(JSON.parse(await response.text()));
    } catch {
      /* handled below */
    }
    const parsed = payload ? parseKimiUsage(payload) : null;
    if (!parsed) {
      const recovered = usageCache.recoverRecent(
        profile.id,
        Boolean(options?.force),
      );
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Kimi 用量响应字段不完整或当前账号无可用额度",
        },
        cache: usageCache.read(profile.id) || cache,
      };
    }
    const planLabel =
      parsed.planLabel ||
      (await fetchPlanLabel(token)) ||
      cache?.planLabel ||
      cache?.planType ||
      null;
    const snapshot: UsageSnapshot = {
      windows: parsed.windows,
      fiveHour: parsed.fiveHour,
      weekly: parsed.weekly,
      planType: planLabel,
      planLabel,
      fetchedAt: new Date().toISOString(),
      source: "live",
    };
    usageCache.write(profile.id, snapshot);
    return { ok: true, snapshot };
  } catch (error) {
    const recovered = usageCache.recoverRecent(
      profile.id,
      Boolean(options?.force),
    );
    if (recovered) return recovered;
    return {
      ok: false,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "网络请求失败",
        detail: error instanceof Error ? error.message : String(error),
      },
      cache: usageCache.read(profile.id) || cache,
    };
  }
}
