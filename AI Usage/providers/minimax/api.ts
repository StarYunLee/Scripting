import { fetch } from "scripting";
import {
  getProfileAccessToken,
  getProfileRegion,
  resolveProfile,
  saveProfileCredentials,
} from "./accounts";
import { formatPlanLabel, inferPlanFromLimit } from "./format";
import { minimaxRequestHeaders, refreshOAuthToken } from "./oauth";
import { quotaUrls, regionProbeOrder } from "./regions";
import { hasMinimaxQuotaRows, parseMinimaxQuota } from "./usage-parser";
import { createUsageCache } from "../../services/usage-cache";
import { shouldServeCache } from "../../services/refresh-policy";
import type {
  MinimaxRegion,
  UsageResult,
  UsageSnapshot,
} from "./types";

const CACHE_KEY = "ai_usage_minimax_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

const usageCache = createUsageCache<UsageSnapshot>({
  keyPrefix: `${CACHE_KEY}_`,
  resolveProfileId: (profileId) => resolveProfile(profileId)?.id || null,
  recentMs: MIN_LIVE_INTERVAL_MS,
});

function readCache(profileId?: string | null): UsageSnapshot | null {
  return usageCache.read(profileId);
}

function writeCache(profileId: string, value: UsageSnapshot): void {
  usageCache.write(profileId, value);
}

export const getCachedUsage = readCache;

export function clearUsageCache(profileId?: string | null): void {
  usageCache.clear(profileId);
}

function recoverRecentCache(
  profileId: string,
  force: boolean,
): UsageResult | null {
  return usageCache.recoverRecent(profileId, force) as UsageResult | null;
}

type QuotaRequestResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number };

async function requestQuota(
  token: string,
  region: MinimaxRegion,
): Promise<QuotaRequestResult> {
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
      const payload = JSON.parse(text) as Record<string, unknown>;
      // HTTP 200 + status_code 0 + 空数组是跨区软失败，必须继续备用 URL/区域。
      if (!hasMinimaxQuotaRows(payload)) continue;
      return { ok: true, payload };
    } catch {
      /* try next URL */
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
  if (shouldServeCache(cache, options, MIN_LIVE_INTERVAL_MS))
    return { ok: true, snapshot: cache! };

  let token = await refreshOAuthToken(profile.id);
  if (!token) token = getProfileAccessToken(profile.id);
  if (!token)
    return {
      ok: false,
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未配置 Subscription Key`,
      },
      cache,
    };

  try {
    const preferred = getProfileRegion(profile.id);
    let payload: Record<string, unknown> | null = null;
    let region: MinimaxRegion | null = null;
    let lastStatus = 0;

    for (const candidate of regionProbeOrder(preferred)) {
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
            ? "MiniMax Subscription Key 无效或已过期，请重新配置"
            : `MiniMax 国内站与国际站用量请求均失败（HTTP ${lastStatus || "?"}）`,
          status: lastStatus || undefined,
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const parsed = parseMinimaxQuota(payload, region);
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
      saveProfileCredentials(profile.id, { accessToken: token, region });
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
      planLabel: planLabel ? `${formatPlanLabel(planLabel)} · ${region === "cn" ? "国内站" : "国际站"}` : region === "cn" ? "国内站" : "国际站",
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
