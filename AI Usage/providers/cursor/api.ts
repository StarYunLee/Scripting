import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  resolveProfile,
} from "./accounts";
import { refreshOAuthToken, ensureAccountEmail } from "./oauth";
import { formatPlanLabel } from "./format";
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types";

const API_BASE = "https://api2.cursor.sh";
const CACHE_KEY = "ai_usage_cursor_cache_v2";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;
const INCLUDED_MODEL_KEY = "gpt-4";

type PlanInfo = {
  planLabel: string | null;
  includedAmountCents: number | null;
  billingCycleEnd: { iso: string | null; ms: number | null };
};

type FetchPayloadOutcome =
  | { ok: true; parsed: ParsedBilling }
  | {
      ok: false;
      code: "unauthorized" | "http_error" | "invalid_json";
      message: string;
      status?: number;
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

/** 兼容 RFC3339 与 unix 毫秒（数字或数字字符串，Cursor Dashboard 常见）。 */
function isoDate(value: unknown): { iso: string | null; ms: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    if (!Number.isFinite(ms) || ms <= 0) return { iso: null, ms: null };
    return { iso: new Date(ms).toISOString(), ms };
  }
  if (typeof value !== "string" || !value.trim()) return { iso: null, ms: null };
  const trimmed = value.trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const raw = Number(trimmed);
    const ms = trimmed.length <= 10 ? raw * 1000 : raw;
    if (!Number.isFinite(ms) || ms <= 0) return { iso: null, ms: null };
    return { iso: new Date(ms).toISOString(), ms };
  }
  const ms = new Date(trimmed).getTime();
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

async function requestPlanInfo(token: string): Promise<PlanInfo> {
  const empty: PlanInfo = {
    planLabel: null,
    includedAmountCents: null,
    billingCycleEnd: { iso: null, ms: null },
  };
  try {
    const response = await requestDashboard(
      token,
      "/aiserver.v1.DashboardService/GetPlanInfo",
    );
    if (!response.ok) return empty;
    const payload = asObject(JSON.parse(await response.text()));
    const planInfo = asObject(payload?.planInfo);
    if (!planInfo) return empty;
    return {
      planLabel: formatPlanLabel(
        typeof planInfo.planName === "string" ? planInfo.planName : null,
      ),
      includedAmountCents: toNumber(planInfo.includedAmountCents),
      billingCycleEnd: isoDate(planInfo.billingCycleEnd),
    };
  } catch {
    return empty;
  }
}

/** 从 displayMessage（如 "You've used 46% of your usage limit"）提取已用百分比。 */
function percentFromDisplayMessage(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return clamp(Number(match[1]));
}

type ParsedBilling = {
  windows: LimitWindow[];
  planLabel: string | null;
};

function makeWindow(
  name: LimitWindow["name"],
  label: string,
  usedPercent: number,
  reset: { iso: string | null; ms: number | null },
): LimitWindow {
  const used = clamp(usedPercent);
  return {
    id: `cursor:${name}`,
    name,
    label,
    usedPercent: used,
    remainingPercent: clamp(100 - used),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: null,
  };
}

function planSpendPercent(
  planUsage: Record<string, unknown> | null,
  plan: PlanInfo,
  displayMessage: unknown,
): number | null {
  if (!planUsage) return percentFromDisplayMessage(displayMessage);
  const limitCents =
    (toNumber(planUsage.limit) != null && toNumber(planUsage.limit)! > 0
      ? toNumber(planUsage.limit)
      : null) ??
    (plan.includedAmountCents != null && plan.includedAmountCents > 0
      ? plan.includedAmountCents
      : null);
  const includedSpend = toNumber(planUsage.includedSpend);
  const totalSpend = toNumber(planUsage.totalSpend);
  const remainingCents = toNumber(planUsage.remaining);
  if (limitCents != null && limitCents > 0) {
    const spend = includedSpend ?? totalSpend;
    if (spend != null) return clamp((spend / limitCents) * 100);
    if (remainingCents != null)
      return clamp(((limitCents - remainingCents) / limitCents) * 100);
  }
  return percentFromDisplayMessage(displayMessage);
}

/**
 * 解析 Cursor 仪表盘用量：
 * - Auto → autoPercentUsed
 * - 所有 → totalPercentUsed（回退套餐花费占比）
 * - 第三方模型 → apiPercentUsed
 */
function parsePlanUsageWindows(
  payload: Record<string, unknown>,
  plan: PlanInfo,
): ParsedBilling | null {
  const planUsage = asObject(payload.planUsage);
  const usageReset = isoDate(payload.billingCycleEnd);
  const reset = usageReset.iso != null ? usageReset : plan.billingCycleEnd;
  const windows: LimitWindow[] = [];

  const autoPercent = toNumber(planUsage?.autoPercentUsed);
  const totalPercent = toNumber(planUsage?.totalPercentUsed);
  const apiPercent = toNumber(planUsage?.apiPercentUsed);
  const spendPercent = planSpendPercent(planUsage, plan, payload.displayMessage);

  if (autoPercent != null)
    windows.push(makeWindow("auto", "Auto", autoPercent, reset));

  // 「所有」优先用 totalPercentUsed；缺失时回退套餐花费占比。
  const allPercent = totalPercent ?? spendPercent;
  if (allPercent != null)
    windows.push(makeWindow("total", "所有", allPercent, reset));

  if (apiPercent != null)
    windows.push(makeWindow("api", "第三方模型", apiPercent, reset));

  // 若三个百分比都缺失，至少保留套餐花费窗口。
  if (!windows.length && spendPercent != null)
    windows.push(makeWindow("plan", "套餐额度", spendPercent, reset));

  if (!windows.length) return null;
  return { windows, planLabel: plan.planLabel };
}

function parseSpendLimit(
  payload: Record<string, unknown>,
  planLabel: string | null,
  reset: { iso: string | null; ms: number | null },
): ParsedBilling | null {
  const spend = asObject(payload.spendLimitUsage);
  if (!spend) return null;
  const limit =
    toNumber(spend.individualLimit) ?? toNumber(spend.pooledLimit);
  const used =
    toNumber(spend.individualUsed) ?? toNumber(spend.pooledUsed);
  const remaining =
    toNumber(spend.individualRemaining) ?? toNumber(spend.pooledRemaining);
  if (limit == null || limit <= 0) return null;
  let usedPercent: number | null = null;
  if (used != null) usedPercent = clamp((used / limit) * 100);
  else if (remaining != null)
    usedPercent = clamp(((limit - remaining) / limit) * 100);
  if (usedPercent == null) return null;
  return {
    windows: [makeWindow("plan", "按需额度", usedPercent, reset)],
    planLabel,
  };
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

  return {
    windows: [
      {
        id: "cursor:requests",
        name: "weekly",
        label: "请求额度",
        usedPercent,
        remainingPercent: clamp(100 - usedPercent),
        resetAt: reset.iso,
        resetAtMs: reset.ms,
        windowSeconds: 30 * 86_400,
      },
    ],
    planLabel: "Enterprise",
  };
}

function toSnapshot(
  parsed: ParsedBilling,
  fetchedAt: string,
  source: "live" | "cache",
): UsageSnapshot {
  const byName = (name: LimitWindow["name"]) =>
    parsed.windows.find((window) => window.name === name) || null;
  return {
    windows: parsed.windows,
    auto: byName("auto"),
    total: byName("total"),
    api: byName("api"),
    plan: byName("plan"),
    weekly: byName("weekly"),
    planType: parsed.planLabel,
    planLabel: parsed.planLabel,
    fetchedAt,
    source,
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

async function fetchUsagePayload(token: string): Promise<FetchPayloadOutcome> {
  const usageResponse = await requestDashboard(
    token,
    "/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
  );
  if (usageResponse.status === 401 || usageResponse.status === 403) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Cursor 授权无效或已过期，请重新登录",
      status: usageResponse.status,
    };
  }

  if (usageResponse.ok) {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = asObject(JSON.parse(await usageResponse.text()));
    } catch {
      /* fall through to legacy */
    }
    if (payload) {
      const plan = await requestPlanInfo(token);
      const usageReset = isoDate(payload.billingCycleEnd);
      const reset = usageReset.iso != null ? usageReset : plan.billingCycleEnd;
      const parsed =
        parsePlanUsageWindows(payload, plan) ||
        parseSpendLimit(payload, plan.planLabel, reset);
      if (parsed) return { ok: true, parsed };
      return {
        ok: false,
        code: "invalid_json",
        message: "Cursor 用量响应缺少可用额度字段",
      };
    }
  } else if (usageResponse.status >= 400) {
    // 主接口失败时仍尝试 legacy；若都失败再带上状态码。
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
  if (legacyResponse.status === 401 || legacyResponse.status === 403) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Cursor 授权无效或已过期，请重新登录",
      status: legacyResponse.status,
    };
  }
  if (!legacyResponse.ok) {
    return {
      ok: false,
      code: "http_error",
      message: `Cursor 用量请求失败（HTTP ${usageResponse.status || legacyResponse.status}）`,
      status: legacyResponse.status,
    };
  }
  let legacyPayload: Record<string, unknown> | null = null;
  try {
    legacyPayload = asObject(JSON.parse(await legacyResponse.text()));
  } catch {
    return {
      ok: false,
      code: "invalid_json",
      message: "Cursor 用量响应不是合法 JSON",
    };
  }
  const legacy = legacyPayload ? parseLegacyUsage(legacyPayload) : null;
  if (legacy) return { ok: true, parsed: legacy };
  return {
    ok: false,
    code: "invalid_json",
    message: "Cursor 用量响应字段不完整或当前账号无可用额度",
  };
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

  // 旧账号可能只有「账号 1」；即使命中用量缓存也先回填邮箱展示名。
  if (!profile.email || /^账号\s*\d+$/i.test(profile.name)) {
    const identityToken =
      getProfileAccessToken(profile.id) ||
      (await refreshOAuthToken(profile.id, false));
    if (identityToken) {
      try {
        await ensureAccountEmail(profile.id, identityToken);
      } catch {
        /* 回填失败不影响用量查询 */
      }
    }
  }

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
    let outcome = await fetchUsagePayload(token);
    if (!outcome.ok && outcome.code === "unauthorized") {
      const refreshedToken = await refreshOAuthToken(profile.id, true);
      if (refreshedToken) {
        token = refreshedToken;
        outcome = await fetchUsagePayload(token);
      }
    } else if (!outcome.ok) {
      const refreshedToken = await refreshOAuthToken(profile.id, true);
      if (refreshedToken) {
        token = refreshedToken;
        const retry = await fetchUsagePayload(token);
        if (retry.ok) outcome = retry;
      }
    }

    if (!outcome.ok) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: outcome.code,
          message: outcome.message,
          status: outcome.status,
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const parsed = outcome.parsed;
    const snapshot = toSnapshot(parsed, new Date().toISOString(), "live");
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
