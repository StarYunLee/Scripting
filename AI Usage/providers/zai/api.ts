import { fetch } from "scripting";
import {
  getProfileAccessToken,
  getProfileRegion,
  resolveProfile,
  saveProfileCredentials,
} from "./accounts";
import { parseZaiQuota, parseZaiSubscription } from "./usage-parser";
import { refreshOAuthToken, zaiRequestHeaders } from "./oauth";
import { createUsageCache } from "../../services/usage-cache";
import type { UsageResult, UsageSnapshot, ZaiRegion } from "./types";

const CACHE_KEY = "ai_usage_zai_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

const ENDPOINTS: Record<ZaiRegion, { quota: string; subscription: string }> = {
  intl: {
    quota: "https://api.z.ai/api/monitor/usage/quota/limit",
    subscription: "https://api.z.ai/api/biz/subscription/list",
  },
  cn: {
    quota: "https://bigmodel.cn/api/monitor/usage/quota/limit",
    subscription: "https://bigmodel.cn/api/biz/subscription/list",
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function fetchPlanLabel(
  token: string,
  region: ZaiRegion,
): Promise<string | null> {
  try {
    const response = await fetch(ENDPOINTS[region].subscription, {
      method: "GET",
      headers: zaiRequestHeaders(token),
      timeout: 15,
      debugLabel: "ZaiSubscription",
    });
    if (!response.ok) return null;
    return parseZaiSubscription(JSON.parse(await response.text()));
  } catch {
    return null;
  }
}

const usageCache = createUsageCache<UsageSnapshot>({
  keyPrefix: `${CACHE_KEY}_`,
  resolveProfileId: (pid) => resolveProfile(pid)?.id || null,
  recentMs: MIN_LIVE_INTERVAL_MS,
});

function readCache(profileId?: string | null) {
  return usageCache.read(profileId);
}
function writeCache(profileId: string, value: UsageSnapshot) {
  usageCache.write(profileId, value);
}
export const getCachedUsage = (profileId?: string | null) =>
  usageCache.read(profileId);
export function clearUsageCache(profileId?: string | null) {
  usageCache.clear(profileId);
}
function recent(cache: UsageSnapshot | null) {
  return usageCache.recent(cache);
}
function recoverRecentCache(
  profileId: string,
  force: boolean,
): UsageResult | null {
  return usageCache.recoverRecent(profileId, force) as UsageResult | null;
}

async function requestQuota(
  token: string,
  region: ZaiRegion,
): Promise<
  { ok: true; payload: Record<string, unknown> } | { ok: false; status: number }
> {
  const response = await fetch(ENDPOINTS[region].quota, {
    method: "GET",
    headers: zaiRequestHeaders(token),
    timeout: 20,
    debugLabel: region === "intl" ? "ZaiQuotaIntl" : "ZaiQuotaCn",
  });
  if (!response.ok) return { ok: false, status: response.status };
  try {
    const payload = asObject(JSON.parse(await response.text()));
    if (!payload) return { ok: false, status: response.status };
    if (payload.success === false && payload.code !== 200)
      return {
        ok: false,
        status: typeof payload.code === "number" ? payload.code : 400,
      };
    return { ok: true, payload };
  } catch {
    return { ok: false, status: response.status };
  }
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
    const order: ZaiRegion[] =
      preferred === "cn" ? ["cn", "intl"] : ["intl", "cn"];
    let payload: Record<string, unknown> | null = null;
    let region: ZaiRegion | null = null;
    const statuses: Partial<Record<ZaiRegion, number>> = {};

    for (const candidate of order) {
      const result = await requestQuota(token, candidate);
      if (result.ok) {
        payload = result.payload;
        region = candidate;
        break;
      }
      statuses[candidate] = result.status;
    }

    if (!payload || !region) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      const isAuth = (status: number | undefined) =>
        status === 401 || status === 403;
      const preferredStatus = statuses[preferred];
      const tried = order.filter((item) => statuses[item] != null);
      const bothAuthFailed =
        tried.length >= 2 && tried.every((item) => isAuth(statuses[item]));
      // Only treat as bad key when the preferred region itself is 401/403,
      // or every region we tried failed auth. A preferred 5xx + fallback 401
      // must surface the preferred HTTP error, not "API Key 无效".
      const unauthorized = isAuth(preferredStatus) || bothAuthFailed;
      const reportStatus =
        preferredStatus ??
        statuses[order.find((item) => item !== preferred)!] ??
        0;
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "http_error",
          message: unauthorized
            ? "Z.ai API Key 无效或已过期，请重新配置"
            : `Z.ai 用量请求失败（HTTP ${reportStatus || "?"}）`,
          status: reportStatus || undefined,
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const parsed = parseZaiQuota(payload);
    if (!parsed) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Z.ai 用量响应字段不完整或当前账号无可用额度",
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
      (await fetchPlanLabel(token, region)) ||
      parsed.planLabel ||
      cache?.planLabel ||
      cache?.planType ||
      null;

    const snapshot: UsageSnapshot = {
      windows: parsed.windows,
      fiveHour: parsed.fiveHour,
      weekly: parsed.weekly,
      monthly: parsed.monthly,
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
