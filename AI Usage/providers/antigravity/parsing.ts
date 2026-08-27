import { antigravityWindowLabel } from "../../copy/labels";
import type { AntigravityProjectInfo, LimitWindow } from "./types";

export type JsonObject = Record<string, unknown>;

type ModelCandidate = {
  id: string;
  displayName: string;
  remainingFraction: unknown;
  reset: unknown;
  order: number;
};

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

function windowSeconds(window: string, bucketId: string): number | null {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[_\- ]/g, "");
  for (const candidate of [normalize(window), normalize(bucketId)]) {
    if (!candidate) continue;
    if (candidate.includes("week")) return 7 * 86400;
    if (candidate.includes("month")) return 30 * 86400;
    if (candidate.includes("day") || candidate.includes("daily")) return 86400;
    for (const match of candidate.matchAll(/(\d+)h/g)) {
      const hours = Number(match[1]);
      if (Number.isFinite(hours) && hours > 0 && hours <= 24 * 31) {
        return hours * 3600;
      }
    }
  }
  return null;
}

function windowName(seconds: number | null): LimitWindow["name"] {
  if (seconds === 5 * 3600) return "five_hour";
  if (seconds === 7 * 86400) return "weekly";
  return "unknown";
}

function windowLabel(
  groupName: string,
  bucketId: string,
  seconds: number | null,
): string {
  return antigravityWindowLabel(groupName, bucketId, seconds);
}

function sortWindows(left: LimitWindow, right: LimitWindow): number {
  const rank = (window: LimitWindow): number => {
    const id = window.id.toLowerCase();
    if (id.includes("gemini_5h")) return 0;
    if (id.includes("gemini_weekly")) return 1;
    if (id.includes("3p_5h")) return 2;
    if (id.includes("3p_weekly")) return 3;
    if (window.name === "five_hour") return 4;
    if (window.name === "weekly") return 5;
    return 6;
  };
  return rank(left) - rank(right) || left.label.localeCompare(right.label);
}

function makeWindow(
  id: string,
  groupName: string,
  bucketId: string,
  window: string,
  fraction: unknown,
  reset: unknown,
  source: LimitWindow["source"],
): LimitWindow | null {
  const remainingFraction = parseFraction(fraction);
  const resetAt = parseDate(reset);
  if (remainingFraction == null && !resetAt.iso) return null;
  const seconds = windowSeconds(window, bucketId);
  const remainingPercent =
    remainingFraction == null ? null : remainingFraction * 100;
  return {
    id,
    name: windowName(seconds),
    label: windowLabel(groupName, bucketId, seconds),
    usedPercent:
      remainingPercent == null ? null : Math.max(0, 100 - remainingPercent),
    remainingPercent,
    resetAt: resetAt.iso,
    resetAtMs: resetAt.ms,
    windowSeconds: seconds,
    source,
  };
}

function quotaKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseQuotaSummary(payload: JsonObject): LimitWindow[] {
  const groups = firstValue(payload, ["groups", "quotaGroups", "quota_groups"]);
  if (!Array.isArray(groups)) return [];
  const windows: LimitWindow[] = [];
  const seen = new Set<string>();
  groups.forEach((value, groupIndex) => {
    const group = asObject(value);
    const groupName =
      textValue(firstValue(group, ["displayName", "display_name"])) || "";
    const buckets = firstValue(group, [
      "buckets",
      "quotaBuckets",
      "quota_buckets",
    ]);
    if (!Array.isArray(buckets)) return;
    buckets.forEach((bucketValue, bucketIndex) => {
      const bucket = asObject(bucketValue);
      if (!bucket) return;
      const bucketId =
        textValue(firstValue(bucket, ["bucketId", "bucket_id", "id"])) || "";
      const window = textValue(bucket.window) || "";
      const stableKey =
        quotaKey(bucketId) ||
        quotaKey(window) ||
        `g${groupIndex}_b${bucketIndex}`;
      if (seen.has(stableKey)) return;
      const parsed = makeWindow(
        `antigravity:${stableKey}`,
        groupName,
        bucketId,
        window,
        firstValue(bucket, [
          "remainingFraction",
          "remaining_fraction",
          "remaining",
        ]),
        firstValue(bucket, ["resetTime", "reset_time"]),
        "quota_summary",
      );
      if (!parsed) return;
      seen.add(stableKey);
      windows.push(parsed);
    });
  });
  return windows.sort(sortWindows);
}

const MODEL_FAMILY_ORDER = [
  "gemini_pro",
  "gemini_flash",
  "gemini_image",
  "claude",
  "other",
] as const;

type ModelFamily = (typeof MODEL_FAMILY_ORDER)[number];

const MODEL_PREFERENCES: Record<Exclude<ModelFamily, "other">, string[]> = {
  gemini_pro: ["gemini-pro-agent", "gemini-3.1-pro-high", "gemini-3.1-pro-low"],
  gemini_flash: ["gemini-3-flash-agent", "gemini-3-flash"],
  gemini_image: ["gemini-3.1-flash-image", "gemini-3-pro-image"],
  claude: ["claude-sonnet-4-6", "claude-opus-4-6-thinking"],
};

function normalizeModelId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^models\//, "");
}

function isInternalModel(id: string): boolean {
  return id.startsWith("chat_") || id.startsWith("tab_");
}

function modelFamily(id: string): ModelFamily {
  if (
    (id.startsWith("gemini") && id.includes("image")) ||
    id.startsWith("image") ||
    id.startsWith("imagen")
  ) {
    return "gemini_image";
  }
  if (id.startsWith("gemini") && id.includes("flash")) return "gemini_flash";
  if (id.startsWith("gemini") && id.includes("pro")) return "gemini_pro";
  if (["claude", "opus", "sonnet", "haiku"].some((part) => id.includes(part))) {
    return "claude";
  }
  return "other";
}

function familyLabel(family: ModelFamily): string {
  if (family === "gemini_pro") return "Gemini Pro";
  if (family === "gemini_flash") return "Gemini Flash";
  if (family === "gemini_image") return "Gemini Image";
  if (family === "claude") return "Claude";
  return "";
}

function preferenceRank(
  family: ModelFamily,
  id: string,
  order: number,
): number {
  if (family === "other") return order;
  const rank = MODEL_PREFERENCES[family].indexOf(id);
  return rank < 0 ? MODEL_PREFERENCES[family].length + order : rank;
}

function modelWindow(
  candidate: ModelCandidate,
  family: ModelFamily,
): LimitWindow | null {
  const label =
    family === "other"
      ? candidate.displayName || candidate.id
      : familyLabel(family);
  const id =
    family === "other"
      ? `antigravity:model_${quotaKey(candidate.id)}`
      : `antigravity:${family}`;
  return makeWindow(
    id,
    label,
    "5h",
    "5h",
    candidate.remainingFraction,
    candidate.reset,
    "available_models",
  );
}

export function parseAvailableModels(payload: JsonObject): LimitWindow[] {
  const models = asObject(payload.models) || payload;
  const families = new Map<ModelFamily, ModelCandidate[]>();
  let order = 0;
  for (const [rawModelId, value] of Object.entries(models)) {
    const id = normalizeModelId(rawModelId);
    const model = asObject(value);
    const quota = asObject(firstValue(model, ["quotaInfo", "quota_info"]));
    if (!id || isInternalModel(id) || !quota) continue;
    const remainingFraction = firstValue(quota, [
      "remainingFraction",
      "remaining_fraction",
      "remaining",
    ]);
    const reset = firstValue(quota, ["resetTime", "reset_time"]);
    if (parseFraction(remainingFraction) == null && !parseDate(reset).iso)
      continue;
    const family = modelFamily(id);
    const candidate: ModelCandidate = {
      id,
      displayName:
        textValue(
          firstValue(model, ["displayName", "display_name", "modelName"]),
        ) || id,
      remainingFraction,
      reset,
      order: order++,
    };
    families.set(family, [...(families.get(family) || []), candidate]);
  }

  const windows: LimitWindow[] = [];
  for (const family of MODEL_FAMILY_ORDER) {
    const members = families.get(family) || [];
    if (!members.length) continue;
    if (family === "other") {
      members
        .sort((left, right) => left.id.localeCompare(right.id))
        .forEach((candidate) => {
          const window = modelWindow(candidate, family);
          if (window) windows.push(window);
        });
      continue;
    }
    members.sort(
      (left, right) =>
        preferenceRank(family, left.id, left.order) -
        preferenceRank(family, right.id, right.order),
    );
    const window = modelWindow(members[0], family);
    if (window) windows.push(window);
  }
  return windows.sort(sortWindows);
}

function normalizeTierLabel(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (/^(google )?ai pro$/.test(normalized)) return "Google AI Pro";
  if (/^(google )?ai ultra$/.test(normalized)) return "Google AI Ultra";
  if (normalized === "google one ai premium") return "Google AI Pro";
  return value.trim();
}

function tierLabel(value: unknown): string | null {
  const object = asObject(value);
  const raw = object?.name ?? object?.displayName ?? object?.id;
  return typeof raw === "string" && raw.trim() ? normalizeTierLabel(raw) : null;
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

  const paid = tierLabel(payload.paidTier);
  let planLabel = paid;
  if (!planLabel) {
    const ineligible = Array.isArray(payload.ineligibleTiers)
      ? payload.ineligibleTiers
      : [];
    if (!ineligible.length) {
      planLabel = tierLabel(payload.currentTier);
    } else {
      const restricted = tierLabel(defaultTier);
      planLabel = restricted ? `${restricted}（受限）` : null;
    }
  }

  return { projectId, planLabel, tierId };
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
