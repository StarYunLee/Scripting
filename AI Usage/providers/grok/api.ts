import { fetch, Response } from "scripting";
import { GROK_WINDOW } from "../../copy/labels";
import {
  getProfileAccessToken,
  getProfileAccountId,
  resolveProfile,
} from "./accounts";
import { refreshOAuthToken } from "./oauth";
import type { LimitWindow, UsageResult, UsageSnapshot } from "./types";

const CACHE_KEY = "ai_usage_grok_cache_v1";
const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing";
const SETTINGS_URL = "https://cli-chat-proxy.grok.com/v1/settings";
const GROK_CLI_VERSION = "1.0.5";
const GROK_CLI_IDENTIFIER = "grok-shell";
const REMAINING_RESETS_URL =
  "https://grok.com/prod_mc_billing.ConsumerUiSvc/GetRemainingResets";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v)))
    return Number(v);
  const wrapped = asObject(v);
  if (wrapped && "val" in wrapped) return toNumber(wrapped.val);
  return null;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
function isoDate(v: unknown): { iso: string | null; ms: number | null } {
  if (typeof v !== "string") return { iso: null, ms: null };
  const ms = new Date(v).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}
function billingHeaders(
  token: string,
  userId: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-version": GROK_CLI_VERSION,
    "x-grok-client-identifier": GROK_CLI_IDENTIFIER,
    "User-Agent": "xai-grok-cli",
    Accept: "application/json",
  };
  if (userId) headers["x-userid"] = userId;
  return headers;
}
async function requestBilling(
  token: string,
  userId: string | null,
): Promise<Response> {
  return fetch(`${BILLING_URL}?format=credits`, {
    method: "GET",
    headers: billingHeaders(token, userId),
    timeout: 20,
    debugLabel: "GrokWeeklyUsage",
  });
}
async function requestPlan(
  token: string,
  userId: string | null,
): Promise<string | null> {
  const response = await fetch(SETTINGS_URL, {
    method: "GET",
    headers: billingHeaders(token, userId),
    timeout: 8,
    debugLabel: "GrokPlan",
  });
  if (!response.ok) return null;
  const payload = asObject(JSON.parse(await response.text()));
  const value = payload?.subscription_tier_display;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
type ResetCreditsSummary = { available: number; expirations: string[] };
function readVarint(data: Uint8Array, start: number): [number, number] {
  let value = 0,
    shift = 0,
    index = start;
  while (index < data.length && shift <= 49) {
    const byte = data[index++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, index];
    shift += 7;
  }
  throw new Error("重置权益响应不完整");
}
function protobufFields(
  data: Uint8Array,
): Array<{ number: number; wire: number; value: number | Uint8Array }> {
  const out: Array<{
    number: number;
    wire: number;
    value: number | Uint8Array;
  }> = [];
  let index = 0;
  while (index < data.length) {
    const [key, next] = readVarint(data, index);
    index = next;
    const number = Math.floor(key / 8),
      wire = key % 8;
    if (wire === 0) {
      const [value, end] = readVarint(data, index);
      index = end;
      out.push({ number, wire, value });
    } else if (wire === 2) {
      const [length, bodyStart] = readVarint(data, index);
      const end = bodyStart + length;
      if (end > data.length) throw new Error("重置权益字段不完整");
      out.push({ number, wire, value: data.subarray(bodyStart, end) });
      index = end;
    } else if (wire === 1) index += 8;
    else if (wire === 5) index += 4;
    else throw new Error(`不支持的重置权益 wire type ${wire}`);
  }
  return out;
}
function parseTimestamp(data: Uint8Array): string | null {
  const seconds = protobufFields(data).find(
    (field) => field.number === 1 && field.wire === 0,
  )?.value;
  if (typeof seconds !== "number" || seconds <= 0) return null;
  const ms = seconds * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function parseRemainingResetsFrame(bytes: Uint8Array): ResetCreditsSummary {
  if (bytes.length < 5) throw new Error("重置权益 gRPC 帧不完整");
  if (bytes[0] !== 0) throw new Error("暂不支持压缩的重置权益响应");
  const messageLength =
    bytes[1] * 2 ** 24 + bytes[2] * 2 ** 16 + bytes[3] * 2 ** 8 + bytes[4];
  if (bytes.length < 5 + messageLength)
    throw new Error("重置权益 gRPC 消息不完整");
  const message = bytes.subarray(5, 5 + messageLength);
  const entries = protobufFields(message).filter(
    (field) =>
      field.number === 10 &&
      field.wire === 2 &&
      field.value instanceof Uint8Array,
  );
  const expirations: string[] = [];
  for (const entry of entries) {
    // field 10 是敏感兑换 Token：只按存在性跳过，永不转换、缓存或记录。
    const expiresField = protobufFields(entry.value as Uint8Array).find(
      (field) => field.number === 30 && field.wire === 2,
    )?.value;
    const expiresAt =
      expiresField instanceof Uint8Array ? parseTimestamp(expiresField) : null;
    if (expiresAt) expirations.push(expiresAt);
  }
  return { available: entries.length, expirations: expirations.sort() };
}
async function requestRemainingResets(
  token: string,
  userId: string | null,
): Promise<ResetCreditsSummary> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-version": GROK_CLI_VERSION,
    "x-grok-client-identifier": GROK_CLI_IDENTIFIER,
    "User-Agent": "xai-grok-cli",
    "Content-Type": "application/grpc+proto",
    Accept: "application/grpc",
    TE: "trailers",
  };
  if (userId) headers["x-userid"] = userId;
  const response = await fetch(REMAINING_RESETS_URL, {
    method: "POST",
    headers,
    body: new Uint8Array(5).buffer,
    timeout: 20,
    debugLabel: "GrokRemainingResets",
  });
  if (!response.ok) throw new Error(`重置权益请求失败 HTTP ${response.status}`);
  const bytes = await response.bytes();
  try {
    return parseRemainingResetsFrame(bytes);
  } finally {
    bytes.fill(0);
  }
}
type ParsedWeekly = {
  weekly: LimitWindow;
  weeklyBuild: LimitWindow | null;
  planLabel: string | null;
};
function planLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const labels: Record<string, string> = {
    supergroklite: "SuperGrok Lite",
    supergrok: "SuperGrok",
    supergrokplus: "SuperGrok Plus",
    supergrokheavy: "SuperGrok Heavy",
    xpremium: "X Premium",
    xpremiumplus: "X Premium+",
  };
  return labels[normalized] || value.trim();
}
function parseWeekly(payload: Record<string, unknown>): ParsedWeekly | null {
  const config = asObject(payload.config);
  if (!config) {
    return null;
  }
  const period = asObject(config.currentPeriod);
  const periodType = period?.type;
  const creditUsagePercent = toNumber(config.creditUsagePercent);
  if (periodType != null && periodType !== "USAGE_PERIOD_TYPE_WEEKLY") {
    return null;
  }
  const resetRaw = period?.end ?? config.billingPeriodEnd;
  const reset = isoDate(resetRaw);
  const productUsage = Array.isArray(config.productUsage)
    ? config.productUsage
    : [];
  const grokBuildUsage = productUsage
    .map((item) => asObject(item))
    .find((item) => {
      const product =
        typeof item?.product === "string"
          ? item.product.toLowerCase().replace(/[^a-z0-9]/g, "")
          : "";
      return (
        product === "grokbuild" ||
        product === "productgrokbuild" ||
        product === "grokcode"
      );
    });
  const productUsagePercent = toNumber(grokBuildUsage?.usagePercent);
  if (!reset.iso) {
    return null;
  }
  const hasExplicitWeeklyPeriod = periodType === "USAGE_PERIOD_TYPE_WEEKLY";
  if (creditUsagePercent == null && !hasExplicitWeeklyPeriod) {
    return null;
  }
  const usedPercent = clamp(creditUsagePercent ?? 0);
  const weekly: LimitWindow = {
    id: "grok:weekly",
    name: "weekly",
    label: GROK_WINDOW.WEEKLY,
    usedPercent,
    remainingPercent: clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: 7 * 86400,
  };
  const weeklyBuild =
    productUsagePercent == null
      ? null
      : {
          id: "grok:weekly-build",
          name: "weekly_build" as const,
          label: GROK_WINDOW.BUILD,
          usedPercent: clamp(productUsagePercent),
          remainingPercent: clamp(100 - productUsagePercent),
          resetAt: reset.iso,
          resetAtMs: reset.ms,
          windowSeconds: 7 * 86400,
        };
  return {
    weekly,
    weeklyBuild,
    planLabel: planLabel(config.subscriptionTier ?? payload.subscriptionTier),
  };
}
function cacheKey(profileId: string): string {
  return `${CACHE_KEY}_${profileId}`;
}
function readCache(profileId?: string | null): UsageSnapshot | null {
  const profile = resolveProfile(profileId);
  if (!profile) return null;
  try {
    const v = Storage.get<UsageSnapshot>(cacheKey(profile.id));
    return v?.fetchedAt ? { ...v, source: "cache" } : null;
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
  const p = resolveProfile(profileId);
  if (p)
    try {
      Storage.remove(cacheKey(p.id));
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
  const userId = getProfileAccountId(profile.id);
  const cacheIsRecent = recent(cache);
  if (!options?.force && cacheIsRecent) {
    return { ok: true, snapshot: cache! };
  }
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
    // 每周 Credits 是唯一核心数据源；先确保 Token 有效，再发可失败辅助请求。
    let weeklyResponse = await requestBilling(token, userId);
    if (weeklyResponse.status === 401) {
      const refreshedToken = await refreshOAuthToken(profile.id, true);
      if (refreshedToken) {
        token = refreshedToken;
        weeklyResponse = await requestBilling(token, userId);
      }
    }
    if (!weeklyResponse.ok) {
      const unauthorized =
        weeklyResponse.status === 401 || weeklyResponse.status === 403;
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "http_error",
          message: unauthorized
            ? "Grok 授权无效或当前账号没有用量权限"
            : `Grok 每周额度请求失败 HTTP ${weeklyResponse.status}`,
        },
        cache: readCache(profile.id) || cache,
      };
    }
    let parsed: ParsedWeekly | null = null;
    try {
      parsed = parseWeekly(
        asObject(JSON.parse(await weeklyResponse.text())) || {},
      );
    } catch {
      /* handled below */
    }
    if (!parsed) {
      const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
      if (recovered) return recovered;
      return {
        ok: false,
        error: { code: "invalid_json", message: "每周额度响应字段不完整" },
        cache: readCache(profile.id) || cache,
      };
    }
    const [resetResult, settingsPlan] = await Promise.all([
      requestRemainingResets(token, userId).catch(() => null),
      requestPlan(token, userId).catch(() => null),
    ]);
    const resetCreditsAvailable =
      resetResult?.available ?? cache?.resetCreditsAvailable ?? null;
    const resetCreditExpirations =
      resetResult?.expirations ?? cache?.resetCreditExpirations ?? [];
    const windows = parsed.weeklyBuild
      ? [parsed.weekly, parsed.weeklyBuild]
      : [parsed.weekly];
    const cachedPlan = cache?.planLabel || cache?.planType || null;
    const plan = planLabel(settingsPlan) || parsed.planLabel || cachedPlan;
    const snapshot: UsageSnapshot = {
      windows,
      fiveHour: null,
      weekly: parsed.weekly,
      weeklyBuild: parsed.weeklyBuild,
      monthly: null,
      planType: plan,
      planLabel: plan,
      resetCreditsAvailable,
      resetCreditExpirations,
      fetchedAt: new Date().toISOString(),
      source: "live",
    };
    writeCache(profile.id, snapshot);
    return { ok: true, snapshot };
  } catch (e) {
    const recovered = recoverRecentCache(profile.id, Boolean(options?.force));
    if (recovered) return recovered;
    const latestCache = readCache(profile.id) || cache;
    return {
      ok: false,
      error: {
        code: "network_error",
        message: e instanceof Error ? e.message : "网络请求失败",
        detail: e instanceof Error ? e.message : String(e),
      },
      cache: latestCache,
    };
  }
}
