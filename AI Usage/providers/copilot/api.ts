import { fetch } from "scripting";
import { getProfileAccessToken, resolveProfile } from "./accounts";
import {
  copilotRequestHeaders,
  ensureAccountEmail,
  refreshOAuthToken,
} from "./oauth";
import { parseCopilotUsage } from "./usage-parser";
import { createUsageCache } from "../../services/usage-cache";
import type { UsageResult, UsageSnapshot } from "./types";

const USAGE_URL = "https://api.github.com/copilot_internal/user";
const CACHE_KEY = "ai_usage_copilot_cache_v1";
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
  let token = await refreshOAuthToken(profile.id, Boolean(options?.force));
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
  if (!profile.email) void ensureAccountEmail(profile.id);
  try {
    const response = await fetch(USAGE_URL, {
      method: "GET",
      headers: copilotRequestHeaders(token),
      timeout: 20,
      debugLabel: "CopilotUsage",
    });
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
            ? "GitHub 授权无效或已过期，请重新登录"
            : `Copilot 用量请求失败（HTTP ${response.status}）`,
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
    const parsed = payload ? parseCopilotUsage(payload) : null;
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
          message: "Copilot 用量响应字段不完整或当前账号无可用额度",
        },
        cache: usageCache.read(profile.id) || cache,
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
