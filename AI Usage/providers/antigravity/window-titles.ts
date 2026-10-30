import type { WindowTitleMode } from "../window-title-contract";
import type { LimitWindow } from "./types";

export type QuotaIdentity = {
  groupName: string;
  bucketId: string;
  window: string;
  bucketName?: string;
};

export type QuotaPeriod = {
  key: string;
  label: string;
  compact: string;
  seconds: number | null;
  order: number;
};

const LEGACY_BUCKETS: Record<string, { group: string; window: string }> = {
  "gemini-5h": { group: "Gemini", window: "5h" },
  "gemini-weekly": { group: "Gemini", window: "weekly" },
  "3p-5h": { group: "Claude/GPT", window: "5h" },
  "3p-weekly": { group: "Claude/GPT", window: "weekly" },
};

function legacyBucket(id: string) {
  return Object.prototype.hasOwnProperty.call(LEGACY_BUCKETS, id.toLowerCase())
    ? LEGACY_BUCKETS[id.toLowerCase()] : undefined;
}

/** Translate only explicit periods. A reset timestamp does not identify a quota cycle. */
export function quotaPeriod(rawWindow: string, bucketId = ""): QuotaPeriod {
  const raw = rawWindow.trim();
  const value = (raw || legacyBucket(bucketId)?.window || "").toLowerCase();
  if (["5h", "five_hour", "5_hour", "fivehour"].includes(value))
    return { key: "5h", label: "5 小时", compact: "5h", seconds: 18000, order: 0 };
  if (["weekly", "week", "7d", "seven_day"].includes(value))
    return { key: "weekly", label: "每周", compact: "7d", seconds: 604800, order: 1 };
  if (["daily", "day", "1d"].includes(value))
    return { key: "daily", label: "每天", compact: "1d", seconds: 86400, order: 2 };
  if (["monthly", "month"].includes(value))
    return { key: "monthly", label: "每月", compact: "每月", seconds: null, order: 2 };
  const hours = /^(\d+)\s*h$/.exec(value);
  if (hours && Number(hours[1]) > 0 && Number(hours[1]) <= 744) {
    const n = Number(hours[1]);
    return { key: `${n}h`, label: `${n} 小时`, compact: `${n}h`, seconds: n * 3600, order: 0 };
  }
  const days = /^(\d+)\s*d$/.exec(value);
  if (days && Number(days[1]) > 0 && Number(days[1]) <= 366) {
    const n = Number(days[1]);
    return { key: `${n}d`, label: `${n} 天`, compact: `${n}d`, seconds: n * 86400, order: 2 };
  }
  return { key: value, label: raw, compact: raw, seconds: null, order: 3 };
}

/** Keep upstream identity; only strip a redundant trailing Models and normalize its conjunction. */
export function shortQuotaGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
    .replace(/\s+models?$/i, "")
    .replace(/\s+and\s+/gi, "/")
    .replace(/\s*\/\s*/g, "/").trim();
}

export function quotaGroupName(quota: QuotaIdentity): string {
  const group = shortQuotaGroupName(quota.groupName);
  const legacy = legacyBucket(quota.bucketId);
  // Exact legacy aliases only; a specific new name always wins over a bucket prefix.
  if (legacy && (!group || (legacy.group === "Claude/GPT" && /^(third party|3p)$/i.test(group))))
    return legacy.group;
  return group || shortQuotaGroupName(quota.bucketName || "") || legacy?.group || quota.bucketId.trim() || "额度";
}

export function quotaWindowTitle(quota: QuotaIdentity, mode: WindowTitleMode = "standard"): string {
  let group = quotaGroupName(quota);
  if (mode === "compact" && group === "Gemini 4 Argon") group = "Argon";
  const period = quotaPeriod(quota.window, quota.bucketId);
  const label = mode === "compact" ? period.compact : period.label;
  return label ? `${group} ${label}` : group;
}

/** Strict legacy ID matching: do not rename a new group's ID by substring. */
export function legacyQuotaIdentity(id: string): QuotaIdentity | null {
  const match = /^antigravity:(gemini_5h|gemini_weekly|3p_5h|3p_weekly)$/.exec(id);
  if (!match) return null;
  const bucketId = match[1].replace(/_/g, "-");
  return { groupName: "", bucketId, window: legacyBucket(bucketId)!.window };
}

export function quotaIdentity(window: LimitWindow): QuotaIdentity | null {
  const quota = window.quota;
  if (quota && typeof quota.groupName === "string" && typeof quota.bucketId === "string" && typeof quota.window === "string")
    return { groupName: quota.groupName, bucketId: quota.bucketId, window: quota.window,
      ...(typeof quota.bucketName === "string" ? { bucketName: quota.bucketName } : {}) };
  return legacyQuotaIdentity(window.id);
}

/** Preserve upstream group order; keep all cycles belonging to that group adjacent. */
export function sortQuotaWindows(windows: LimitWindow[]): LimitWindow[] {
  const groups = new Map<string, number>();
  const entries = windows.map((window, index) => {
    const quota = quotaIdentity(window);
    const group = quota ? quotaGroupName(quota) : window.label;
    if (!groups.has(group)) groups.set(group, groups.size);
    const period = quota ? quotaPeriod(quota.window, quota.bucketId) : null;
    return { window, index, group: groups.get(group)!, period };
  });
  entries.sort((a, b) => a.group - b.group || (a.period?.order ?? 3) - (b.period?.order ?? 3)
    || (a.period?.seconds ?? Infinity) - (b.period?.seconds ?? Infinity) || a.index - b.index);
  return entries.map(entry => entry.window);
}
