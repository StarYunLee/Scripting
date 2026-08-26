import { fetch } from "scripting";
import { COPILOT_WINDOW } from "../../copy/labels";
import { getProfileAccessToken, resolveProfile } from "./accounts";
import { formatPlanLabel } from "./format";
import { copilotRequestHeaders, refreshOAuthToken } from "./oauth";
import type { LimitWindow, LimitWindowName, UsageResult, UsageSnapshot } from "./types";

const USAGE_URL = "https://api.github.com/copilot_internal/user";
const CACHE_KEY = "ai_usage_copilot_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

type QuotaDetail = {
  entitlement: number;
  remaining: number;
  percent_remaining: number;
  unlimited: boolean;
  overage_count?: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function resetFromPayload(payload: Record<string, unknown>): {
  iso: string | null;
  ms: number | null;
} {
  const raw =
    payload.quota_reset_date_utc ||
    payload.quota_reset_date ||
    payload.quotaResetDateUtc ||
    payload.quotaResetDate;
  if (typeof raw !== "string" || !raw.trim()) return { iso: null, ms: null };
  const trimmed = raw.trim();
  const ms = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return { iso: null, ms: null };
  return { iso: new Date(ms).toISOString(), ms };
}

function parseQuota(
  name: LimitWindowName,
  label: string,
  snap: QuotaDetail | null,
  reset: { iso: string | null; ms: number | null },
): LimitWindow | null {
  if (!snap || snap.unlimited) return null;
  if (snap.entitlement <= 0 && snap.remaining <= 0) return null;
  const remainingPercent = clamp(snap.percent_remaining);
  const usedPercent = clamp(100 - snap.percent_remaining);
  return {
    id: `copilot:${name}`,
    name,
    label,
    usedPercent,
    remainingPercent,
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: 30 * 86400,
  };
}

function parseUsages(payload: Record<string, unknown>): {
  windows: LimitWindow[];
  credits: LimitWindow | null;
  chat: LimitWindow | null;
  completions: LimitWindow | null;
  planLabel: string | null;
} | null {
  const snapshots = asObject(payload.quota_snapshots);
  if (!snapshots) return null;
  const reset = resetFromPayload(payload);
  const premium = asObject(snapshots.premium_interactions) as QuotaDetail | null;
  const chatSnap = asObject(snapshots.chat) as QuotaDetail | null;
  const completionsSnap = asObject(snapshots.completions) as QuotaDetail | null;

  const credits = parseQuota("credits", COPILOT_WINDOW.CREDITS, premium, reset);
  const chat = parseQuota("chat", COPILOT_WINDOW.CHAT, chatSnap, reset);
  const completions = parseQuota(
    "completions",
    COPILOT_WINDOW.COMPLETIONS,
    completionsSnap,
    reset,
  );

  const windows = [credits, chat, completions].filter(
    (window) => window != null,
  ) as LimitWindow[];
  if (!windows.length) return null;

  const planRaw =
    typeof payload.copilot_plan === "string" ? payload.copilot_plan : null;
  return {
    windows,
    credits,
    chat,
    completions,
    planLabel: formatPlanLabel(planRaw),
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

  let token = await refreshOAuthToken(profile.id, Boolean(options?.force));
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
    const response = await fetch(USAGE_URL, {
      method: "GET",
      headers: copilotRequestHeaders(token),
      timeout: 20,
      debugLabel: "CopilotUsage",
    });

    if (!response.ok) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      const unauthorized = response.status === 401 || response.status === 403;
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "http_error",
          message: unauthorized
            ? "GitHub 授权无效或已过期，请重新登录"
            : `Copilot 用量请求失败（HTTP ${response.status}）`,
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
          message: "Copilot 用量响应字段不完整或当前账号无可用额度",
        },
        cache: readCache(profile.id) || cache,
      };
    }

    const snapshot: UsageSnapshot = {
      windows: parsed.windows,
      credits: parsed.credits,
      chat: parsed.chat,
      completions: parsed.completions,
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
