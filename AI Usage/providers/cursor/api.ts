import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  resolveProfile,
} from "./accounts";
import { refreshOAuthToken } from "./oauth";
import { formatPlanLabel } from "./format";
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types";

const API_BASE = "https://api2.cursor.sh";
const CACHE_KEY = "ai_usage_cursor_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;
const INCLUDED_MODEL_KEY = "gpt-4";

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
  if (typeof value !== "string") return { iso: null, ms: null };
  const ms = new Date(value).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
  };
}

async function requestDashboard(
  token: string,
  path: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
    timeout: 20,
    debugLabel: "CursorDashboard",
  });
}

async function requestPlan(token: string): Promise<string | null> {
  const response = await requestDashboard(
    token,
    "/aiserver.v1.DashboardService/GetPlanInfo",
  );
  if (!response.ok) return null;
  const payload = asObject(JSON.parse(await response.text()));
  const planInfo = asObject(payload?.planInfo);
  const planName = planInfo?.planName;
  return formatPlanLabel(typeof planName === "string" ? planName : null);
}

type ParsedBilling = {
  window: LimitWindow;
  planLabel: string | null;
};

function parseBillingCycle(
  payload: Record<string, unknown>,
  planLabel: string | null,
): ParsedBilling | null {
  const planUsage = asObject(payload.planUsage);
  const reset = isoDate(payload.billingCycleEnd);
  if (!planUsage) return null;

  const limitCents = toNumber(planUsage.limit);
  const includedSpend = toNumber(planUsage.includedSpend);
  const totalSpend = toNumber(planUsage.totalSpend);
  const remainingCents = toNumber(planUsage.remaining);
  const totalPercentUsed = toNumber(planUsage.totalPercentUsed);

  let usedPercent: number | null = null;
  if (limitCents != null && limitCents > 0) {
    const spend = includedSpend ?? totalSpend;
    if (spend != null) usedPercent = clamp((spend / limitCents) * 100);
  }
  if (usedPercent == null && totalPercentUsed != null)
    usedPercent = clamp(totalPercentUsed);
  if (usedPercent == null && remainingCents != null && limitCents != null && limitCents > 0)
    usedPercent = clamp(((limitCents - remainingCents) / limitCents) * 100);
  if (usedPercent == null || !reset.iso) return null;

  const window: LimitWindow = {
    id: "cursor:billing_cycle",
    name: "billing_cycle",
    label: "计费周期",
    usedPercent,
    remainingPercent: clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: null,
  };
  return { window, planLabel };
}

function parseLegacyUsage(payload: Record<string, unknown>): ParsedBilling | null {
  const startOfMonth = isoDate(payload.startOfMonth);
  const entries = Object.entries(payload).filter(
    ([key, value]) => key !== "startOfMonth" && asObject(value),
  );
  const preferred =
    entries.find(([key]) => key === INCLUDED_MODEL_KEY) || entries[0];
  if (!preferred) return null;
  const bucket = asObject(preferred[1]);
  const used = toNumber(bucket?.numRequests);
  const max = toNumber(bucket?.maxRequestUsage);
  if (used == null || max == null || max <= 0) return null;
  const usedPercent = clamp((used / max) * 100);
  const reset = startOfMonth.iso
    ? {
        iso: new Date(
          new Date(startOfMonth.iso).getTime() + 30 * 86_400_000,
        ).toISOString(),
        ms: startOfMonth.ms ? startOfMonth.ms + 30 * 86_400_000 : null,
      }
    : { iso: null, ms: null };

  const window: LimitWindow = {
    id: "cursor:requests",
    name: "weekly",
    label: "请求额度",
    usedPercent,
    remainingPercent: clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: 30 * 86_400,
  };
  return { window, planLabel: "Enterprise" };
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

async function fetchUsagePayload(token: string): Promise<ParsedBilling | null> {
  const usageResponse = await requestDashboard(
    token,
    "/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
  );
  if (usageResponse.ok) {
    const payload = asObject(JSON.parse(await usageResponse.text()));
    if (payload) {
      const planLabel = await requestPlan(token).catch(() => null);
      const parsed = parseBillingCycle(payload, planLabel);
      if (parsed) return parsed;
    }
  }

  const legacyResponse = await fetch(`${API_BASE}/auth/usage`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    timeout: 20,
    debugLabel: "CursorLegacyUsage",
  });
  if (!legacyResponse.ok) return null;
  const legacyPayload = asObject(JSON.parse(await legacyResponse.text()));
  return legacyPayload ? parseLegacyUsage(legacyPayload) : null;
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
    let parsed = await fetchUsagePayload(token);
    if (!parsed) {
      const refreshedToken = await refreshOAuthToken(profile.id, true);
      if (refreshedToken) {
        token = refreshedToken;
        parsed = await fetchUsagePayload(token);
      }
    }

    if (!parsed) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Cursor 用量响应字段不完整或当前账号无可用额度",
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const snapshot: UsageSnapshot = {
      windows: [parsed.window],
      billingCycle: parsed.window,
      weekly: parsed.window.name === "weekly" ? parsed.window : null,
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
