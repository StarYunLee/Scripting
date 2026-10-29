import { fetch } from "scripting";
import { captureAccountWork, captureAccountCredentialWork } from "../../services/account-work-guard";
import { createAccountOperationFlight } from "../../services/runtime-consistency";
import { createUsageCache } from "../../services/usage-cache";
import type { UsageBalanceView } from "../../models";
import { getProfileAccessToken, resolveProfile } from "./accounts";
import {
  buildBalanceWindows,
  parseBalancePayload,
  sanitizeBalanceView,
} from "./usage-parser";
import type {
  UsageErrorCode,
  UsageResult,
  UsageSnapshot,
  VerifyKeyResult,
} from "./types";

const BALANCE_URL = "https://api.deepseek.com/user/balance";
const CACHE_KEY = "ai_usage_deepseek_cache_v1";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;
const PLAN_LABEL = "API";
const REQUEST_TIMEOUT_SECONDS = 20;

const usageCache = createUsageCache<UsageSnapshot>({
  keyPrefix: `${CACHE_KEY}_`,
  resolveProfileId: (profileId) => resolveProfile(profileId)?.id || null,
  recentMs: MIN_LIVE_INTERVAL_MS,
});

/** 粘贴容错：去空白与误带的 Bearer 前缀；内部空白视为误贴。 */
export function normalizeDeepseekApiKey(input: string): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/^Bearer\s+/i, "").trim();
  if (!text || text.length < 8 || /\s/.test(text)) return null;
  return text;
}

/** 错误信息只描述状态，不回显用户 Key、上游正文或请求头。 */
function errorMessage(code: UsageErrorCode, status?: number): string {
  switch (code) {
    case "unauthorized":
      return "DeepSeek API Key 无效或已过期，请重新配置";
    case "rate_limited":
      return "DeepSeek 请求过于频繁（HTTP 429），请稍后重试";
    case "http_error":
      return `DeepSeek 余额请求失败（HTTP ${status || "?"}）`;
    case "network_error":
      return "DeepSeek 余额请求网络失败";
    case "invalid_response":
      return "DeepSeek 余额响应字段不完整或格式非法";
    case "missing_token":
      return "尚未配置 DeepSeek API Key";
    case "account_changed":
      return "账号或 Key 已变化，已丢弃本次余额结果";
    default:
      return "DeepSeek 余额查询失败";
  }
}

type BalanceResponse =
  | { ok: true; payload: unknown }
  | { ok: false; code: UsageErrorCode; status?: number };

/** 官方余额请求：仅 Bearer + Accept，20 秒超时；不发送任何模型请求。 */
async function requestBalance(token: string): Promise<BalanceResponse> {
  try {
    const response = await fetch(BALANCE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      timeout: REQUEST_TIMEOUT_SECONDS,
      debugLabel: "DeepseekBalance",
    });
    if (response.status === 401 || response.status === 403)
      return { ok: false, code: "unauthorized", status: response.status };
    if (response.status === 429)
      return { ok: false, code: "rate_limited", status: 429 };
    if (!response.ok)
      return { ok: false, code: "http_error", status: response.status };
    const text = await response.text();
    if (!text.trim() || text.trim().startsWith("<"))
      return { ok: false, code: "invalid_response" };
    try {
      return { ok: true, payload: JSON.parse(text) };
    } catch {
      return { ok: false, code: "invalid_response" };
    }
  } catch {
    // 不把异常正文（可能含 URL/上游内容）带进用户可见错误。
    return { ok: false, code: "network_error" };
  }
}

/** 授权阶段用候选 Key 校验；零余额（is_available=false）也算成功。 */
export async function verifyDeepseekApiKey(
  apiKey: string,
): Promise<VerifyKeyResult> {
  const token = normalizeDeepseekApiKey(apiKey);
  if (!token)
    return {
      ok: false,
      code: "unauthorized",
      message: "请粘贴完整的 DeepSeek API Key",
    };
  const response = await requestBalance(token);
  if (!response.ok)
    return {
      ok: false,
      code: response.code,
      message: errorMessage(response.code, response.status),
      status: response.status,
    };
  const balances = parseBalancePayload(response.payload);
  if (!balances)
    return {
      ok: false,
      code: "invalid_response",
      message: errorMessage("invalid_response"),
    };
  return { ok: true, balances };
}

/** 读取缓存时重建窗口，避免旧结构/脏数据进入 UI。 */
function sanitizeSnapshot(snapshot: UsageSnapshot | null): UsageSnapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (
    typeof snapshot.fetchedAt !== "string" ||
    !Number.isFinite(new Date(snapshot.fetchedAt).getTime())
  )
    return null;
  const balances: UsageBalanceView[] = [];
  for (const window of Array.isArray(snapshot.windows) ? snapshot.windows : []) {
    const balance = sanitizeBalanceView(
      (window as { balance?: unknown } | null)?.balance,
    );
    if (!balance || balances.some((item) => item.currency === balance.currency))
      continue;
    balances.push(balance);
  }
  if (!balances.length) return null;
  return {
    windows: buildBalanceWindows(balances),
    planLabel: PLAN_LABEL,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source === "live" ? "live" : "cache",
  };
}

function readCache(profileId?: string | null): UsageSnapshot | null {
  return sanitizeSnapshot(usageCache.read(profileId));
}

function writeCache(profileId: string, value: UsageSnapshot): boolean {
  return usageCache.write(profileId, value);
}

export const getCachedUsage = readCache;

export function clearUsageCache(profileId?: string | null): void {
  usageCache.clear(profileId);
}

/** 失败时保留旧缓存与原始 fetchedAt，绝不伪造 0 余额或当前时间。 */
function failureOrCache(
  profileId: string,
  code: UsageErrorCode,
  status: number | undefined,
  cached: UsageSnapshot | null,
): UsageResult {
  const cache = readCache(profileId) || cached;
  return {
    ok: false,
    error: { code, message: errorMessage(code, status), status },
    cache,
  };
}

async function runFetch(
  profileId: string,
  token: string,
  cached: UsageSnapshot | null,
): Promise<UsageResult> {
  const currentWork = captureAccountWork("deepseek", profileId);
  const response = await requestBalance(token);
  // 晚回守卫：Key 轮换、删除或外部 retire 后丢弃结果，不写别人的余额。
  const accountIntact =
    currentWork() &&
    Boolean(resolveProfile(profileId)) &&
    getProfileAccessToken(profileId) === token;
  if (!accountIntact)
    return {
      ok: false,
      error: { code: "account_changed", message: errorMessage("account_changed") },
      cache: null,
    };
  if (!response.ok) {
    if (response.code === "unauthorized")
      return {
        ok: false,
        error: {
          code: "unauthorized",
          message: errorMessage("unauthorized"),
          status: response.status,
        },
        cache: readCache(profileId) || cached,
      };
    return failureOrCache(profileId, response.code, response.status, cached);
  }
  const balances = parseBalancePayload(response.payload);
  if (!balances)
    return failureOrCache(profileId, "invalid_response", undefined, cached);
  const snapshot: UsageSnapshot = {
    windows: buildBalanceWindows(balances),
    planLabel: PLAN_LABEL,
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
  const storageAccepted = writeCache(profileId, snapshot);
  return { ok: true, snapshot, storageAccepted };
}

const runAccountFetch = createAccountOperationFlight<UsageResult>();

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

  const cached = readCache(profile.id);
  const token = getProfileAccessToken(profile.id);
  if (!token)
    return {
      ok: false,
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未配置 DeepSeek API Key`,
      },
      cache: cached,
    };

  if (!options?.force && cached && usageCache.recent(cached))
    return { ok: true, snapshot: cached };

  const isCurrent = captureAccountCredentialWork("deepseek", profile.id,
    () => getProfileAccessToken(profile.id));
  // 同一账号、同一凭据的请求合并；旧 Key 任务可以结束，但不能吸收新 Key 的刷新。
  return runAccountFetch(profile.id,
    () => runFetch(profile.id, token, cached), isCurrent);
}
