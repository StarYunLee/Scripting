import { CURSOR_WINDOW } from "../../copy/labels";
import type { LimitWindow, UsageSnapshot } from "./types";

export type CursorPlanInfo = {
  planLabel: string | null;
  includedAmountCents: number | null;
  billingCycleEnd: unknown;
};

export type ParsedCursorUsage = {
  windows: LimitWindow[];
  planLabel: string | null;
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

function dateValue(value: unknown): { iso: string | null; ms: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    if (ms <= 0) return { iso: null, ms: null };
    return { iso: new Date(ms).toISOString(), ms };
  }
  if (typeof value !== "string" || !value.trim()) return { iso: null, ms: null };
  const trimmed = value.trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const raw = Number(trimmed);
    const ms = trimmed.length <= 10 ? raw * 1000 : raw;
    if (!Number.isFinite(ms) || ms <= 0) return { iso: null, ms: null };
    return { iso: new Date(ms).toISOString(), ms };
  }
  const ms = new Date(trimmed).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}

function makeWindow(
  name: LimitWindow["name"],
  label: string,
  usedPercent: number,
  reset: { iso: string | null; ms: number | null },
  windowSeconds: number | null = null,
): LimitWindow {
  const used = clamp(usedPercent);
  return {
    id: `cursor:${name}`,
    name,
    label,
    usedPercent: used,
    remainingPercent: clamp(100 - used),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds,
  };
}

function percentFromMessage(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? clamp(Number(match[1])) : null;
}

export function parseCursorCurrentUsage(
  payload: Record<string, unknown>,
  plan: CursorPlanInfo,
): ParsedCursorUsage | null {
  const usage = asObject(payload.planUsage);
  const usageReset = dateValue(payload.billingCycleEnd);
  const planReset = dateValue(plan.billingCycleEnd);
  const reset = usageReset.iso ? usageReset : planReset;
  const windows: LimitWindow[] = [];
  const autoPercent = toNumber(usage?.autoPercentUsed);
  const totalPercent = toNumber(usage?.totalPercentUsed);
  const apiPercent = toNumber(usage?.apiPercentUsed);

  const limit =
    (toNumber(usage?.limit) ?? plan.includedAmountCents) || null;
  const spend = toNumber(usage?.includedSpend) ?? toNumber(usage?.totalSpend);
  const remaining = toNumber(usage?.remaining);
  let spendPercent: number | null = null;
  if (limit != null && limit > 0) {
    if (spend != null) spendPercent = clamp((spend / limit) * 100);
    else if (remaining != null)
      spendPercent = clamp(((limit - remaining) / limit) * 100);
  }
  if (spendPercent == null) spendPercent = percentFromMessage(payload.displayMessage);

  if (autoPercent != null)
    windows.push(makeWindow("auto", CURSOR_WINDOW.AUTO, autoPercent, reset));
  const allPercent = totalPercent ?? spendPercent;
  if (allPercent != null)
    windows.push(
      makeWindow("total", CURSOR_WINDOW.TOTAL, allPercent, reset),
    );
  if (apiPercent != null)
    windows.push(makeWindow("api", CURSOR_WINDOW.API, apiPercent, reset));
  if (!windows.length) return null;
  return { windows, planLabel: plan.planLabel };
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

export function parseCursorSandUsage(
  payload: Record<string, unknown>,
): LimitWindow | null {
  const root =
    asObject(payload.sandUsage) ||
    asObject(payload.sand_usage) ||
    asObject(payload.usageStatus) ||
    asObject(payload.status) ||
    payload;
  const includedLimit =
    toNumber(root.includedLimit) ??
    toNumber(root.included_limit) ??
    toNumber(root.includedAmount) ??
    toNumber(root.limit);
  const hasLimit =
    truthy(root.hasNonZeroIncludedLimit) ||
    truthy(root.has_non_zero_included_limit) ||
    (includedLimit != null && includedLimit > 0);
  if (!hasLimit) return null;
  const used =
    toNumber(root.usagePercent) ??
    toNumber(root.usage_percent) ??
    toNumber(root.percentUsed) ??
    toNumber(root.usedPercent) ??
    toNumber(root.used_percent);
  if (used == null) return null;
  const reset = dateValue(
    root.nextResetTimestampUtc ??
      root.next_reset_timestamp_utc ??
      root.nextResetTime ??
      root.resetAt ??
      root.reset_at,
  );
  const start = dateValue(
    root.currentPeriodStart ?? root.current_period_start ?? root.periodStart,
  );
  const seconds =
    start.ms != null && reset.ms != null && reset.ms > start.ms
      ? Math.round((reset.ms - start.ms) / 1000)
      : 7 * 86400;
  return makeWindow(
    "grok_bot",
    CURSOR_WINDOW.GROK_BOT,
    used,
    reset,
    seconds,
  );
}

export function parseCursorLegacyUsage(
  payload: Record<string, unknown>,
): ParsedCursorUsage | null {
  const entries = Object.entries(payload).filter(
    ([key, value]) => key !== "startOfMonth" && asObject(value),
  );
  const preferred = entries.find(([key]) => key === "gpt-4") || entries[0];
  if (!preferred) return null;
  const bucket = asObject(preferred[1]);
  const used = toNumber(bucket?.numRequests);
  const max = toNumber(bucket?.maxRequestUsage);
  if (used == null || max == null || max <= 0) return null;
  const start = dateValue(payload.startOfMonth);
  const resetMs = start.ms != null ? start.ms + 30 * 86400000 : null;
  const reset = {
    ms: resetMs,
    iso: resetMs != null ? new Date(resetMs).toISOString() : null,
  };
  return {
    planLabel: "Enterprise",
    windows: [
      {
        ...makeWindow(
          "weekly",
          CURSOR_WINDOW.REQUEST,
          (used / max) * 100,
          reset,
          30 * 86400,
        ),
        id: "cursor:requests",
      },
    ],
  };
}

export function cursorSnapshot(
  parsed: ParsedCursorUsage,
  fetchedAt: string,
  source: "live" | "cache",
): UsageSnapshot {
  const byName = (name: LimitWindow["name"]) =>
    parsed.windows.find((window) => window.name === name) || null;
  return {
    windows: parsed.windows,
    auto: byName("auto"),
    total: byName("total"),
    api: byName("api"),
    grokBot: byName("grok_bot"),
    weekly: byName("weekly"),
    planType: parsed.planLabel,
    planLabel: parsed.planLabel,
    fetchedAt,
    source,
  };
}
