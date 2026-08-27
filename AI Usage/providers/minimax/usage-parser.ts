import { MINIMAX_WINDOW } from "../../copy/labels";
import { formatPlanLabel } from "./format";
import type { LimitWindow, MinimaxRegion } from "./types";

export type ParsedMinimaxQuota = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planLabel: string | null;
  intervalTotal: number | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function quotaRows(payload: unknown): Record<string, unknown>[] {
  const object = asObject(payload);
  if (!object) return [];
  const direct = object.model_remains;
  const nested = asObject(object.data)?.model_remains;
  const raw = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  const rows: Record<string, unknown>[] = [];
  for (const value of raw) {
    const row = asObject(value);
    if (row) rows.push(row);
  }
  return rows;
}

export function hasMinimaxQuotaRows(payload: unknown): boolean {
  const object = asObject(payload);
  if (!object) return false;
  const base = asObject(object.base_resp);
  const statusCode = toNumber(base?.status_code);
  if (statusCode != null && statusCode !== 0) return false;
  return quotaRows(object).length > 0;
}

function pickPrimaryRow(
  rows: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!rows.length) return null;
  const score = (row: Record<string, unknown>) => {
    const name = String(row.model_name || row.modelName || "").toLowerCase();
    if (/minimax-m|m\d|general|text|coding/.test(name)) return 3;
    if (/image|video|speech|voice/.test(name)) return 0;
    return 1;
  };
  return [...rows].sort((left, right) => score(right) - score(left))[0] || null;
}

function resetFromRow(
  endTime: unknown,
  remainsTime: unknown,
): { iso: string | null; ms: number | null } {
  const endMs = toNumber(endTime);
  if (endMs != null && endMs > 0) {
    const ms = endMs < 1e12 ? endMs * 1000 : endMs;
    return { iso: new Date(ms).toISOString(), ms };
  }
  const remainsMs = toNumber(remainsTime);
  if (remainsMs != null && remainsMs > 0) {
    const ms = Date.now() + remainsMs;
    return { iso: new Date(ms).toISOString(), ms };
  }
  return { iso: null, ms: null };
}

function remainingCount(
  region: MinimaxRegion,
  total: number | null,
  usageCount: number | null,
  explicitRemaining: number | null,
): number | null {
  if (explicitRemaining != null) return Math.max(0, explicitRemaining);
  if (total == null || usageCount == null) return null;
  return region === "cn"
    ? Math.max(0, usageCount)
    : Math.max(0, total - usageCount);
}

function windowFromCounts(options: {
  id: string;
  name: "five_hour" | "weekly";
  label: string;
  total: number | null;
  usageCount: number | null;
  explicitRemaining: number | null;
  explicitRemainingPercent: number | null;
  reset: { iso: string | null; ms: number | null };
  windowSeconds: number;
  region: MinimaxRegion;
}): LimitWindow | null {
  const remaining = remainingCount(
    options.region,
    options.total,
    options.usageCount,
    options.explicitRemaining,
  );
  const remainingPercent =
    options.explicitRemainingPercent != null
      ? clamp(options.explicitRemainingPercent)
      : options.total != null && options.total > 0 && remaining != null
        ? clamp((remaining / options.total) * 100)
        : null;
  if (remainingPercent == null) return null;
  return {
    id: options.id,
    name: options.name,
    label: options.label,
    usedPercent: clamp(100 - remainingPercent),
    remainingPercent,
    resetAt: options.reset.iso,
    resetAtMs: options.reset.ms,
    windowSeconds: options.windowSeconds,
  };
}

export function parseMinimaxQuota(
  payload: unknown,
  region: MinimaxRegion,
): ParsedMinimaxQuota | null {
  if (!hasMinimaxQuotaRows(payload)) return null;
  const object = asObject(payload)!;
  const row = pickPrimaryRow(quotaRows(object));
  if (!row) return null;

  const intervalTotal = toNumber(row.current_interval_total_count);
  const fiveHour = windowFromCounts({
    id: "minimax:five_hour",
    name: "five_hour",
    label: MINIMAX_WINDOW.FIVE_HOUR,
    total: intervalTotal,
    usageCount: toNumber(row.current_interval_usage_count),
    explicitRemaining:
      toNumber(row.current_interval_remaining_count) ??
      toNumber(row.current_interval_remains_count),
    explicitRemainingPercent: toNumber(row.current_interval_remaining_percent),
    reset: resetFromRow(row.end_time, row.remains_time),
    windowSeconds: 5 * 3600,
    region,
  });

  const weekly = windowFromCounts({
    id: "minimax:weekly",
    name: "weekly",
    label: MINIMAX_WINDOW.WEEKLY,
    total: toNumber(row.current_weekly_total_count),
    usageCount: toNumber(row.current_weekly_usage_count),
    explicitRemaining:
      toNumber(row.current_weekly_remaining_count) ??
      toNumber(row.current_weekly_remains_count),
    explicitRemainingPercent: toNumber(row.current_weekly_remaining_percent),
    reset: resetFromRow(row.weekly_end_time, row.weekly_remains_time),
    windowSeconds: 7 * 86400,
    region,
  });

  const windows: LimitWindow[] = [];
  if (fiveHour) windows.push(fiveHour);
  if (weekly) windows.push(weekly);
  if (!windows.length) return null;
  const planRaw =
    (typeof row.current_subscribe_title === "string" &&
      row.current_subscribe_title) ||
    (typeof row.plan_name === "string" && row.plan_name) ||
    (typeof row.plan === "string" && row.plan) ||
    (typeof object.current_subscribe_title === "string" &&
      object.current_subscribe_title) ||
    null;
  return {
    windows,
    fiveHour,
    weekly,
    planLabel: formatPlanLabel(planRaw),
    intervalTotal,
  };
}
