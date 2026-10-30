import type { AntigravityProjectInfo, LimitWindow } from "./types";
import {
  displayAntigravityPlanLabel,
  knownAntigravityPlanLabel,
} from "./plan-label";
import { quotaPeriod, quotaWindowTitle, sortQuotaWindows, type QuotaIdentity } from "./window-titles";

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstValue(object: JsonObject | null, keys: string[]): unknown {
  for (const key of keys) {
    if (object && key in object) return object[key];
  }
  return undefined;
}

function parseFraction(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const percent = raw.endsWith("%");
  const parsed = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, percent ? parsed / 100 : parsed));
}

function parseDate(value: unknown): { iso: string | null; ms: number | null } {
  if (typeof value !== "string" && typeof value !== "number") {
    return { iso: null, ms: null };
  }
  let ms: number;
  if (typeof value === "number") {
    ms = value > 1e12 ? value : value * 1000;
  } else {
    const numeric = Number(value);
    ms = Number.isFinite(numeric)
      ? numeric > 1e12
        ? numeric
        : numeric * 1000
      : new Date(value).getTime();
  }
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}

function quotaKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function windowName(seconds: number | null): LimitWindow["name"] {
  return seconds === 18000 ? "five_hour" : seconds === 604800 ? "weekly" : "unknown";
}

export function parseQuotaSummary(payload: JsonObject): LimitWindow[] {
  const groups = firstValue(payload, ["groups", "quotaGroups", "quota_groups"]);
  if (!Array.isArray(groups)) return [];
  const windows: LimitWindow[] = [];
  const seen = new Set<string>();
  const usedIds = new Set<string>();
  groups.forEach((value, groupIndex) => {
    const group = asObject(value);
    const groupName = textValue(firstValue(group, ["displayName", "display_name"])) || "";
    const buckets = firstValue(group, ["buckets", "quotaBuckets", "quota_buckets"]);
    if (!Array.isArray(buckets)) return;
    buckets.forEach((rawBucket, bucketIndex) => {
      const bucket = asObject(rawBucket);
      if (!bucket) return;
      const bucketId = textValue(firstValue(bucket, ["bucketId", "bucket_id", "id"])) || "";
      const rawWindow = textValue(bucket.window) || "";
      const bucketName = textValue(firstValue(bucket, ["displayName", "display_name"]));
      const quota: QuotaIdentity = { groupName, bucketId, window: rawWindow,
        ...(bucketName ? { bucketName } : {}) };
      const period = quotaPeriod(rawWindow, bucketId);
      const fraction = parseFraction(firstValue(bucket, ["remainingFraction", "remaining_fraction", "remaining"]));
      const reset = parseDate(firstValue(bucket, ["resetTime", "reset_time"]));
      if (fraction == null && !reset.iso) return;
      const identity = JSON.stringify(bucketId
        ? [bucketId, period.key]
        : ["position", groupIndex, bucketIndex]);
      if (seen.has(identity)) return;
      seen.add(identity);
      const base = quotaKey(bucketId) || quotaKey(rawWindow) || `g${groupIndex}_b${bucketIndex}`;
      let id = `antigravity:${base}`;
      if (usedIds.has(id)) {
        // Keep the previous first occurrence's ID; only newly retained collisions get a suffix.
        const suffix = quotaKey(period.key) || "quota";
        id = `antigravity:${base}__${suffix}`;
        if (usedIds.has(id)) id += `_${encodeURIComponent(identity)}`;
      }
      usedIds.add(id);
      const remainingPercent = fraction == null ? null : fraction * 100;
      windows.push({ id, name: windowName(period.seconds), label: quotaWindowTitle(quota),
        usedPercent: remainingPercent == null ? null : Math.max(0, 100 - remainingPercent),
        remainingPercent, resetAt: reset.iso, resetAtMs: reset.ms,
        windowSeconds: period.seconds, quota, source: "quota_summary" });
    });
  });
  return sortQuotaWindows(windows);
}

function tierCandidates(value: unknown): string[] {
  const object = asObject(value);
  const values = typeof value === "string"
    ? [value]
    : [object?.name, object?.displayName, object?.id];
  return values
    .map(textValue)
    .filter((candidate): candidate is string => candidate !== null);
}

function tierLabel(candidates: string[]): string | null {
  const known = candidates
    .map(knownAntigravityPlanLabel)
    .filter((label): label is string => label !== null);
  const families = new Set(known.map((label) =>
    /^Google AI Ultra(?: (?:5x|20x))?$/.test(label)
      ? "Google AI Ultra"
      : label,
  ));
  // 身份字段互相冲突时不选择更高或更低套餐，交给最后已知值回退。
  if (families.size > 1) return null;
  if (families.has("Google AI Ultra")) {
    const variants = [...new Set(known.filter((label) =>
      label !== "Google AI Ultra",
    ))];
    // 系列名不能遮住明确倍率；倍率互相冲突时只保留已确认系列。
    return variants.length === 1 ? variants[0] : "Google AI Ultra";
  }
  return displayAntigravityPlanLabel(known[0] || candidates[0]);
}

export function parseProjectInfo(payload: JsonObject): AntigravityProjectInfo {
  const projectValue = payload.cloudaicompanionProject;
  const projectObject = asObject(projectValue);
  const projectId =
    typeof projectValue === "string" && projectValue.trim()
      ? projectValue.trim()
      : typeof projectObject?.id === "string" && projectObject.id.trim()
        ? projectObject.id.trim()
        : null;

  const tiers = Array.isArray(payload.allowedTiers) ? payload.allowedTiers : [];
  const defaultTier = tiers.find((item) => asObject(item)?.isDefault === true);
  const defaultTierId = asObject(defaultTier)?.id;
  const paidTier = asObject(payload.paidTier);
  const currentTier = asObject(payload.currentTier);
  const fallbackTierId = paidTier?.id ?? currentTier?.id;
  const tierId =
    typeof defaultTierId === "string" && defaultTierId.trim()
      ? defaultTierId.trim()
      : typeof fallbackTierId === "string" && fallbackTierId.trim()
        ? fallbackTierId.trim()
        : "legacy-tier";

  const paidCandidates = tierCandidates(payload.paidTier);
  const currentCandidates = tierCandidates(payload.currentTier);
  const planSource = paidCandidates.length
    ? "paid"
    : currentCandidates.length
      ? "current"
      : null;
  // allowedTiers / ineligibleTiers 只表达可用性，不代表实际已订阅。
  const planLabel = tierLabel(
    planSource === "paid" ? paidCandidates : currentCandidates,
  );

  return { projectId, planLabel, planSource, tierId };
}

export function parseOAuthCallback(
  input: string,
  expectedState: string,
): string {
  let value = input.trim();
  if (!value) throw new Error("请粘贴 Google OAuth 回调地址");
  if (/^localhost:51121(?:\/|$)/i.test(value)) value = `http://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Antigravity 回调地址格式无效");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "localhost" ||
    url.port !== "51121" ||
    url.pathname !== "/oauth-callback"
  ) {
    throw new Error("不是预期的 localhost:51121/oauth-callback 地址");
  }
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(url.searchParams.get("error_description") || error);
  }
  const state = url.searchParams.get("state");
  if (!state || state !== expectedState) {
    throw new Error("Google OAuth state 校验失败");
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("回调地址中没有 authorization code");
  return code;
}
