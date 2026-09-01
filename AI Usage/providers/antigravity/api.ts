import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  resolveProfile,
  updateProfileInfo,
} from "./accounts";
import { shouldStopCodeAssistHostLoop } from "./host-failover";
import { fetchAccountInfo, refreshOAuthToken } from "./oauth";
import {
  asObject,
  parseAvailableModels,
  parseQuotaSummary,
  type JsonObject,
} from "./parsing";
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types";

const CACHE_KEY = "ai_usage_antigravity_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;
const CODE_ASSIST_HOSTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
] as const;
const QUOTA_SUMMARY_PATH = "/v1internal:retrieveUserQuotaSummary";
const MODELS_PATH = "/v1internal:fetchAvailableModels";
const CLIENT_USER_AGENT = "vscode/1.X.X (Antigravity/4.3.0)";

type UpstreamError = Error & { status?: number };

function upstreamError(message: string, status?: number): UpstreamError {
  const error = new Error(message) as UpstreamError;
  error.status = status;
  return error;
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

export const getCachedUsage = (profileId?: string | null) =>
  readCache(profileId);

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
  const time = new Date(cache.fetchedAt).getTime();
  return Number.isFinite(time) && Date.now() - time < MIN_LIVE_INTERVAL_MS;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": CLIENT_USER_AGENT,
  };
}

async function parseResponse(response: Response): Promise<JsonObject> {
  const text = await response.text();
  try {
    const payload = asObject(JSON.parse(text));
    if (payload) return payload;
  } catch {
    /* handled below */
  }
  throw upstreamError(
    `Antigravity 响应不是合法 JSON（HTTP ${response.status}）`,
    response.status,
  );
}

async function postQuota(
  token: string,
  path: string,
  projectId: string | null,
): Promise<JsonObject> {
  let lastError: unknown = null;
  for (const host of CODE_ASSIST_HOSTS) {
    const bodies = projectId ? [{ project: projectId }, {}] : [{}];
    for (const body of bodies) {
      try {
        const response = await fetch(`${host}${path}`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(body),
          timeout: 15,
          debugLabel: "AntigravityUsage",
        });
        if (response.ok) return parseResponse(response);
        lastError = upstreamError(
          `Antigravity 用量请求失败 HTTP ${response.status}`,
          response.status,
        );
        if (response.status !== 403) break;
      } catch (error) {
        lastError = error;
        break;
      }
    }
    const status = (lastError as UpstreamError | null)?.status;
    if (shouldStopCodeAssistHostLoop(status)) break;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Antigravity 用量请求失败");
}

async function fetchQuotaWindows(
  token: string,
  projectId: string | null,
): Promise<LimitWindow[]> {
  try {
    const summary = await postQuota(token, QUOTA_SUMMARY_PATH, projectId);
    const windows = parseQuotaSummary(summary);
    if (windows.length) return windows;
  } catch (error) {
    const status = (error as UpstreamError).status;
    if (status === 401 || status === 403 || status === 429) throw error;
  }
  return parseAvailableModels(await postQuota(token, MODELS_PATH, projectId));
}

function shouldRefreshAccountInfo(planLabel: string | null): boolean {
  if (!planLabel) return true;
  return /gemini code assist|受限|restricted/i.test(planLabel);
}

async function fetchLive(
  profileId: string,
  token: string,
  profile: NonNullable<ReturnType<typeof resolveProfile>>,
): Promise<UsageSnapshot> {
  const accountInfo = shouldRefreshAccountInfo(profile.planLabel)
    ? fetchAccountInfo(token).catch(() => null)
    : Promise.resolve(null);
  const [info, windows] = await Promise.all([
    accountInfo,
    fetchQuotaWindows(token, profile.projectId),
  ]);
  const projectId = info?.projectId || profile.projectId;
  const planLabel = info?.planLabel || profile.planLabel;
  if (info) updateProfileInfo(profileId, { projectId, planLabel });

  if (!windows.length) {
    throw upstreamError("Antigravity 响应中没有可用额度窗口", 200);
  }
  return {
    windows,
    planType: planLabel,
    planLabel,
    projectId,
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
}

function failure(error: unknown, cache: UsageSnapshot | null): UsageResult {
  const status = (error as UpstreamError).status;
  const unauthorized = status === 401 || status === 403;
  return {
    ok: false,
    error: {
      code: unauthorized
        ? "unauthorized"
        : status === 200
          ? "invalid_json"
          : status
            ? "http_error"
            : "network_error",
      message: unauthorized
        ? "Google Antigravity 授权已失效或该账号无权读取用量"
        : error instanceof Error
          ? error.message
          : "Antigravity 用量请求失败",
      status,
    },
    cache,
  };
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
  const cache = readCache(profile.id);
  if (!options?.force && recent(cache)) return { ok: true, snapshot: cache! };

  let token = await refreshOAuthToken(profile.id);
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
    let snapshot: UsageSnapshot;
    try {
      snapshot = await fetchLive(profile.id, token, profile);
    } catch (error) {
      if ((error as UpstreamError).status !== 401) throw error;
      const refreshed = await refreshOAuthToken(profile.id, true);
      if (!refreshed || refreshed === token) throw error;
      snapshot = await fetchLive(profile.id, refreshed, profile);
    }
    writeCache(profile.id, snapshot);
    return { ok: true, snapshot };
  } catch (error) {
    return failure(error, cache);
  }
}
