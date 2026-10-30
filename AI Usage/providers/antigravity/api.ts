import {
  captureAccountWork,
  assertCurrentAccountWork,
} from "../../services/account-work-guard";
import {
  createRequestBudget,
  type RequestBudget,
} from "../../services/request-budget";
import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  resolveProfile,
  updateProfileInfo,
} from "./accounts";
import { shouldStopCodeAssistHostLoop } from "./host-failover";
import {
  displayAntigravityPlanLabel,
  isUnspecifiedAntigravityUltra,
  resolveAntigravityPlanLabel,
} from "./plan-label";
import { fetchAccountInfo, refreshOAuthToken } from "./oauth";
import { quotaSummaryWindows } from "./normalize";
import {
  asObject,
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
const CLIENT_USER_AGENT = "antigravity/hub/2.19.1 windows/amd64";

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
    if (!value || typeof value !== "object") return null;
    if (typeof value.fetchedAt !== "string" || !value.fetchedAt) return null;
    if (!Array.isArray(value.windows)) return null;
    // 旧缓存可能来自已下线的 fetchAvailableModels 回退（或两类窗口混写）。
    // 只在读取结果里过滤成真实 quota summary 窗口，不回写 Storage、不清偏好；
    // 缺 source 的历史条目同样不猜来源，交给 quotaSummaryWindows 统一判定。
    const windows = quotaSummaryWindows(
      value.windows
        .filter((window) => Boolean(window) && typeof window === "object")
        .map((window) => ({ ...window })),
    );
    if (!windows.length) return null;
    return {
      windows,
      planType: typeof value.planType === "string" ? value.planType : null,
      planLabel: typeof value.planLabel === "string" ? value.planLabel : null,
      projectId:
        typeof value.projectId === "string" ? value.projectId : null,
      fetchedAt: value.fetchedAt,
      source: "cache",
    };
  } catch {
    return null;
  }
}

function writeCache(profileId: string, value: UsageSnapshot): boolean {
  try {
    return Storage.set(cacheKey(profileId), { ...value, source: "cache" });
  } catch {
    return false;
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
  budget: RequestBudget,
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
          timeout: budget.timeoutSeconds(15),
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
  budget: RequestBudget,
): Promise<LimitWindow[]> {
  // 只读取真实额度摘要；postQuota保留原host/project重试，401由fetchUsage刷新后重试。
  const summary = await postQuota(
    token,
    QUOTA_SUMMARY_PATH,
    projectId,
    budget,
  );
  return parseQuotaSummary(summary);
}

function shouldRefreshAccountInfo(planLabel: string | null): boolean {
  const label = displayAntigravityPlanLabel(planLabel);
  if (!label || isUnspecifiedAntigravityUltra(label)) return true;
  return /gemini code assist|受限|restricted/i.test(planLabel || "");
}

async function fetchLive(
  profileId: string,
  token: string,
  profile: NonNullable<ReturnType<typeof resolveProfile>>,
  budget: RequestBudget,
  forceAccountInfo = false,
): Promise<UsageSnapshot> {
  const accountInfo =
    forceAccountInfo || shouldRefreshAccountInfo(profile.planLabel)
      ? fetchAccountInfo(
          token,
          createRequestBudget(Math.min(3000, budget.remainingMs())),
        ).catch(() => null)
      : Promise.resolve(null);
  const [info, windows] = await Promise.all([
    accountInfo,
    fetchQuotaWindows(token, profile.projectId, budget),
  ]);
  const projectId = info?.projectId || profile.projectId;
  const planLabel = resolveAntigravityPlanLabel(info, profile.planLabel);
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
  const budget = createRequestBudget(30_000);
  const profile = resolveProfile(options?.profileId);
  if (!profile) {
    return {
      ok: false,
      error: { code: "missing_token", message: "未找到指定账号" },
      cache: null,
    };
  }
  const currentWork = captureAccountWork("antigravity", profile.id);
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
      snapshot = await fetchLive(
        profile.id,
        token,
        profile,
        budget,
        options?.force === true,
      );
    } catch (error) {
      if ((error as UpstreamError).status !== 401) throw error;
      const refreshed = await refreshOAuthToken(profile.id, true);
      if (!refreshed || refreshed === token) throw error;
      token = refreshed;
      snapshot = await fetchLive(
        profile.id,
        token,
        profile,
        budget,
        options?.force === true,
      );
    }
    assertCurrentAccountWork(
      currentWork,
      getProfileAccessToken(profile.id) === token,
    );
    const storageAccepted = writeCache(profile.id, snapshot);
    return { ok: true, snapshot, storageAccepted };
  } catch (error) {
    return failure(error, cache);
  }
}
