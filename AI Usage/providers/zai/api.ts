import { fetch } from "scripting";
import { PERIOD, ZAI_WINDOW } from "../../copy/labels";
import {
  getProfileAccessToken,
  getProfileRegion,
  resolveProfile,
  saveProfileCredentials,
} from "./accounts";
import { formatPlanLabel } from "./format";
import { refreshOAuthToken, zaiRequestHeaders } from "./oauth";
import type {
  LimitWindow,
  LimitWindowName,
  UsageResult,
  UsageSnapshot,
  ZaiRegion,
} from "./types";

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

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function windowFromLimit(
  item: Record<string, unknown>,
  index: number,
): LimitWindow | null {
  const type = String(item.type || "");
  const unit = toNumber(item.unit);
  const number = toNumber(item.number);
  const percentage = toNumber(item.percentage);
  if (percentage == null) return null;
  const usedPercent = clamp(percentage);
  const remainingPercent = clamp(100 - usedPercent);
  const resetMs = toNumber(item.nextResetTime);
  const resetAt =
    resetMs != null && resetMs > 0 ? new Date(resetMs).toISOString() : null;

  let name: LimitWindowName = "unknown";
  let label = PERIOD.QUOTA.app;
  let windowSeconds: number | null = null;

  if (type === "TOKENS_LIMIT") {
    if (unit === 3 && number === 5) {
      name = "five_hour";
      label = ZAI_WINDOW.FIVE_HOUR;
      windowSeconds = 5 * 3600;
    } else if (unit === 6 && number === 7) {
      name = "weekly";
      label = ZAI_WINDOW.WEEKLY;
      windowSeconds = 7 * 86400;
    } else if (unit === 5 || number === 1) {
      name = "monthly";
      label = ZAI_WINDOW.MONTHLY;
      windowSeconds = 30 * 86400;
    } else {
      name = index === 0 ? "five_hour" : "weekly";
      label = name === "five_hour" ? ZAI_WINDOW.FIVE_HOUR : ZAI_WINDOW.WEEKLY;
      windowSeconds = name === "five_hour" ? 5 * 3600 : 7 * 86400;
    }
  } else if (type === "TIME_LIMIT") {
    name = "monthly";
    label = ZAI_WINDOW.WEB_SEARCH;
    windowSeconds = 30 * 86400;
  } else {
    return null;
  }

  return {
    id: `zai:${name}:${index}`,
    name,
    label,
    usedPercent,
    remainingPercent,
    resetAt,
    resetAtMs: resetMs,
    windowSeconds,
  };
}

function parseQuota(payload: Record<string, unknown>): {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  monthly: LimitWindow | null;
} | null {
  const data = asObject(payload.data);
  const limits = Array.isArray(data?.limits) ? data!.limits : [];
  const windows: LimitWindow[] = [];
  for (const [index, item] of limits.entries()) {
    const record = asObject(item);
    if (!record) continue;
    const window = windowFromLimit(record, index);
    if (window) windows.push(window);
  }
  if (!windows.length) return null;

  const byName = (name: LimitWindowName) =>
    windows.find((window) => window.name === name) || null;

  // 展示顺序：5 小时 → 每周 → 每月
  windows.sort((a, b) => {
    const rank = (name: LimitWindowName) =>
      name === "five_hour" ? 0 : name === "weekly" ? 1 : name === "monthly" ? 2 : 3;
    return rank(a.name) - rank(b.name);
  });

  return {
    windows,
    fiveHour: byName("five_hour"),
    weekly: byName("weekly"),
    monthly: byName("monthly"),
  };
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
    const payload = asObject(JSON.parse(await response.text()));
    if (!payload) return null;
    const list = Array.isArray(payload.data) ? payload.data : [];
    for (const item of list) {
      const record = asObject(item);
      if (!record) continue;
      const status = String(record.status || "").toUpperCase();
      if (status && status !== "VALID" && !record.inCurrentPeriod) continue;
      const name =
        typeof record.productName === "string"
          ? record.productName
          : typeof record.product_name === "string"
            ? record.product_name
            : null;
      const label = formatPlanLabel(name);
      if (label) return label;
    }
    return null;
  } catch {
    return null;
  }
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
  region: ZaiRegion,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; status: number }> {
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
      return { ok: false, status: typeof payload.code === "number" ? payload.code : 400 };
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
    const order: ZaiRegion[] = preferred === "cn" ? ["cn", "intl"] : ["intl", "cn"];
    let payload: Record<string, unknown> | null = null;
    let region: ZaiRegion | null = null;
    let lastStatus = 0;

    for (const candidate of order) {
      const result = await requestQuota(token, candidate);
      if (result.ok) {
        payload = result.payload;
        region = candidate;
        break;
      }
      lastStatus = result.status;
      if (result.status === 401 || result.status === 403) continue;
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
            ? "Z.ai API Key 无效或已过期，请重新配置"
            : `Z.ai 用量请求失败（HTTP ${lastStatus || "?"}）`,
          status: lastStatus || undefined,
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const parsed = parseQuota(payload);
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
