import {
  captureAccountWork,
  assertCurrentAccountWork,
} from "../../services/account-work-guard";
import {
  createRequestBudget,
  type RequestBudget,
} from "../../services/request-budget";
import { fetch, type Response } from "scripting";
import {
  getProfileAccessToken,
  needsEmailBackfill,
  resolveProfile,
} from "./accounts";
import { ensureAccountEmail, refreshOAuthToken } from "./oauth";
import { createUsageCache } from "../../services/usage-cache";
import {
  cursorSnapshot,
  parseCursorCurrentUsage,
  parseCursorLegacyUsage,
  parseCursorSandUsage,
  type CursorPlanInfo,
  type ParsedCursorUsage,
} from "./usage-parser";
import type { UsageResult, UsageSnapshot } from "./types";

const API_BASE = "https://api2.cursor.sh";
const CACHE_KEY = "ai_usage_cursor_cache_v3";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

type FetchPayloadOutcome =
  | { ok: true; parsed: ParsedCursorUsage }
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
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
}
function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function dateValue(value: unknown): unknown {
  return value;
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
  budget: RequestBudget,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
    timeout: budget.timeoutSeconds(20),
    debugLabel: "CursorDashboard",
  });
}

async function requestPlanInfo(
  token: string,
  budget: RequestBudget,
): Promise<CursorPlanInfo> {
  const empty: CursorPlanInfo = {
    planLabel: null,
    includedAmountCents: null,
    billingCycleEnd: null,
  };
  try {
    const response = await requestDashboard(
      token,
      "/aiserver.v1.DashboardService/GetPlanInfo",
      budget,
    );
    if (!response.ok) return empty;
    const payload = asObject(JSON.parse(await response.text()));
    const planInfo = asObject(payload?.planInfo) || payload;
    const planLabel = firstString(
      planInfo?.planLabel,
      planInfo?.displayName,
      planInfo?.planName,
      planInfo?.subscriptionType,
    );
    return {
      planLabel,
      includedAmountCents:
        toNumber(planInfo?.includedAmountCents) ??
        toNumber(planInfo?.includedAmount),
      billingCycleEnd: dateValue(
        planInfo?.billingCycleEnd ?? planInfo?.billingCycleEndTimestamp,
      ),
    };
  } catch {
    return empty;
  }
}

async function requestMembershipLabel(
  token: string,
  budget: RequestBudget,
): Promise<string | null> {
  try {
    const response = await requestDashboard(
      token,
      "/aiserver.v1.DashboardService/GetTeamMembers",
      budget,
    );
    if (!response.ok) return null;
    const payload = asObject(JSON.parse(await response.text()));
    return firstString(payload?.membershipType, payload?.planName);
  } catch {
    return null;
  }
}

async function attachGrokBotWindow(
  token: string,
  parsed: ParsedCursorUsage,
  budget: RequestBudget,
): Promise<ParsedCursorUsage> {
  try {
    const response = await requestDashboard(
      token,
      "/aiserver.v1.DashboardService/GetSandUsageStatus",
      budget,
    );
    if (!response.ok) return parsed;
    const payload = asObject(JSON.parse(await response.text()));
    const window = payload ? parseCursorSandUsage(payload) : null;
    return window
      ? { ...parsed, windows: [...parsed.windows, window] }
      : parsed;
  } catch {
    return parsed;
  }
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

async function fetchUsagePayload(
  token: string,
  budget: RequestBudget,
): Promise<FetchPayloadOutcome> {
  const response = await requestDashboard(
    token,
    "/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
    budget,
  );
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Cursor 授权无效或已过期，请重新登录",
      status: response.status,
    };
  }
  if (response.ok) {
    try {
      const payload = asObject(JSON.parse(await response.text()));
      if (payload) {
        const plan = await requestPlanInfo(token, budget);
        if (!plan.planLabel)
          plan.planLabel = await requestMembershipLabel(
            token,
            createRequestBudget(Math.min(3000, budget.remainingMs())),
          );
        let parsed = parseCursorCurrentUsage(payload, plan);
        if (parsed) {
          parsed = await attachGrokBotWindow(
            token,
            parsed,
            createRequestBudget(Math.min(3000, budget.remainingMs())),
          );
          return { ok: true, parsed };
        }
      }
    } catch {
      /* fall through to legacy */
    }
  }

  const legacy = await fetch(`${API_BASE}/auth/usage`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: budget.timeoutSeconds(20),
    debugLabel: "CursorLegacyUsage",
  });
  if (legacy.status === 401 || legacy.status === 403) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Cursor 授权无效或已过期，请重新登录",
      status: legacy.status,
    };
  }
  if (!legacy.ok) {
    return {
      ok: false,
      code: "http_error",
      message: `Cursor 用量请求失败（HTTP ${legacy.status}）`,
      status: legacy.status,
    };
  }
  try {
    const payload = asObject(JSON.parse(await legacy.text()));
    let parsed = payload ? parseCursorLegacyUsage(payload) : null;
    if (parsed) {
      parsed = await attachGrokBotWindow(
        token,
        parsed,
        createRequestBudget(Math.min(3000, budget.remainingMs())),
      );
      return { ok: true, parsed };
    }
  } catch {
    return {
      ok: false,
      code: "invalid_json",
      message: "Cursor 用量响应不是合法 JSON",
    };
  }
  return {
    ok: false,
    code: "invalid_json",
    message: "Cursor 用量响应缺少可用额度字段",
  };
}

export async function fetchUsage(options?: {
  force?: boolean;
  profileId?: string | null;
}): Promise<UsageResult> {
  const budget = createRequestBudget(30_000);
  const profile = resolveProfile(options?.profileId);
  if (!profile) {
    return {
      ok: false,
      error: { code: "missing_token", message: "未找到指定账号" },
      cache: null,
    };
  }
  const currentWork = captureAccountWork("cursor", profile.id);
  const cache = usageCache.read(profile.id);
  if (needsEmailBackfill(profile)) {
    const identityToken =
      getProfileAccessToken(profile.id) ||
      (await refreshOAuthToken(profile.id, false));
    if (identityToken) {
      try {
        await ensureAccountEmail(profile.id, identityToken);
      } catch {
        /* optional identity backfill */
      }
    }
  }
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
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未授权`,
      },
      cache,
    };
  }
  try {
    let outcome = await fetchUsagePayload(token, budget);
    if (!outcome.ok) {
      const refreshed = await refreshOAuthToken(profile.id, true);
      if (refreshed) {
        token = refreshed;
        const retry = await fetchUsagePayload(token, budget);
        if (retry.ok || outcome.code === "unauthorized") outcome = retry;
      }
    }
    if (!outcome.ok) {
      const recovered = usageCache.recoverRecent(
        profile.id,
        Boolean(options?.force),
      );
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: outcome.code,
          message: outcome.message,
          status: outcome.status,
        },
        cache: usageCache.read(profile.id) || cache,
      };
    }
    const snapshot = cursorSnapshot(
      outcome.parsed,
      new Date().toISOString(),
      "live",
    );
    assertCurrentAccountWork(
      currentWork,
      getProfileAccessToken(profile.id) === token,
    );
    const storageAccepted = usageCache.write(profile.id, snapshot);
    return { ok: true, snapshot, storageAccepted };
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
