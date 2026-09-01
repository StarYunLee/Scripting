import type { LimitWindow } from "./types";

export type ParsedKimiUsage = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planLabel: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
}
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
function dateValue(value: unknown): { iso: string | null; ms: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return ms > 0
      ? { iso: new Date(ms).toISOString(), ms }
      : { iso: null, ms: null };
  }
  if (typeof value !== "string" || !value.trim())
    return { iso: null, ms: null };
  const trimmed = value.trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const number = Number(trimmed);
    const ms = trimmed.length <= 10 ? number * 1000 : number;
    return Number.isFinite(ms) && ms > 0
      ? { iso: new Date(ms).toISOString(), ms }
      : { iso: null, ms: null };
  }
  const ms = new Date(trimmed).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}
function resetTime(record: Record<string, unknown>): {
  iso: string | null;
  ms: number | null;
} {
  for (const key of [
    "resetTime",
    "reset_time",
    "resetAt",
    "reset_at",
    "resetsAt",
    "resets_at",
    "nextResetTime",
    "next_reset_time",
  ]) {
    const result = dateValue(record[key]);
    if (result.iso) return result;
  }
  return { iso: null, ms: null };
}
function quotaPercents(record: Record<string, unknown> | null): {
  used: number | null;
  remaining: number | null;
} {
  if (!record) return { used: null, remaining: null };
  const limit = toNumber(record.limit);
  const used = toNumber(record.used);
  const remaining = toNumber(record.remaining);
  if (limit == null || limit <= 0) return { used: null, remaining: null };
  const usedValue = used ?? (remaining != null ? limit - remaining : null);
  if (usedValue == null) return { used: null, remaining: null };
  const percent = clamp((usedValue / limit) * 100);
  return { used: percent, remaining: clamp(100 - percent) };
}
function windowSeconds(window: Record<string, unknown> | null): number | null {
  if (!window) return null;
  const duration = toNumber(window.duration);
  const unit = String(window.timeUnit ?? window.time_unit ?? "").toUpperCase();
  if (duration == null || duration <= 0) return null;
  if (unit.includes("MINUTE")) return duration * 60;
  if (unit.includes("HOUR")) return duration * 3600;
  if (unit.includes("DAY")) return duration * 86400;
  if (unit.includes("WEEK")) return duration * 7 * 86400;
  return null;
}
function rollingLabel(seconds: number | null): string {
  if (seconds == null) return "滚动额度";
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return "滚动额度";
}
function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function formatKimiPlanLabel(
  value: string | null | undefined,
): string | null {
  if (!value || !value.trim()) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^level[_-]?/, "")
    .replace(/[\s_-]+/g, "");
  const observed: Record<string, string> = {
    free: "Free",
    basic: "Adagio",
    standard: "Moderato",
    intermediate: "Allegretto",
    advanced: "Allegro",
    premium: "Vivace",
    adagio: "Adagio",
    andante: "Andante",
    moderato: "Moderato",
    allegretto: "Allegretto",
    allegro: "Allegro",
    vivace: "Vivace",
    enterprise: "Enterprise",
  };
  return observed[normalized] || value.trim();
}

export function parseKimiMembership(
  payload: Record<string, unknown>,
): string | null {
  const user = asObject(payload.user);
  const membership =
    asObject(user?.membership) ||
    asObject(payload.membership) ||
    asObject(user?.subscription) ||
    asObject(payload.subscription);
  return formatKimiPlanLabel(
    firstString(
      membership?.level,
      membership?.name,
      membership?.plan,
      membership?.planName,
      membership?.plan_name,
      membership?.tier,
      membership?.tierName,
      membership?.tier_name,
      user?.membership_level,
      user?.membershipLevel,
      user?.plan,
      payload.membership_level,
      payload.plan,
      typeof payload.membership === "string" ? payload.membership : null,
    ),
  );
}

export function parseKimiUsage(
  payload: Record<string, unknown>,
): ParsedKimiUsage | null {
  const windows: LimitWindow[] = [];
  let weekly: LimitWindow | null = null;
  const weeklyUsage = asObject(payload.usage);
  const weeklyPercents = quotaPercents(weeklyUsage);
  if (weeklyUsage && weeklyPercents.used != null) {
    const reset = resetTime(weeklyUsage);
    weekly = {
      id: "kimi:weekly",
      name: "weekly",
      label: "每周",
      usedPercent: weeklyPercents.used,
      remainingPercent: weeklyPercents.remaining,
      resetAt: reset.iso,
      resetAtMs: reset.ms,
      windowSeconds: 7 * 86400,
    };
  }

  const rolling: LimitWindow[] = [];
  const limits = Array.isArray(payload.limits) ? payload.limits : [];
  for (const item of limits) {
    const root = asObject(item);
    if (!root) continue;
    const detail = asObject(root.detail) || root;
    const descriptor = asObject(root.window);
    const seconds = windowSeconds(descriptor);
    const percents = quotaPercents(detail);
    // 仅有 window 描述、算不出用量时跳过，禁止伪造 usedPercent=0。
    const used = percents.used;
    if (used == null) continue;
    const reset = resetTime(detail);
    rolling.push({
      id: `kimi:rolling_${seconds ?? "unknown"}`,
      name: "unknown",
      label: rollingLabel(seconds),
      usedPercent: used,
      remainingPercent: percents.remaining ?? clamp(100 - used),
      resetAt: reset.iso,
      resetAtMs: reset.ms,
      windowSeconds: seconds,
    });
  }
  rolling.sort(
    (left, right) =>
      (left.windowSeconds ?? Number.MAX_SAFE_INTEGER) -
      (right.windowSeconds ?? Number.MAX_SAFE_INTEGER),
  );
  const fiveHour = rolling[0]
    ? { ...rolling[0], name: "five_hour" as const }
    : null;
  if (fiveHour) windows.push(fiveHour);
  windows.push(...rolling.slice(1));
  if (weekly) windows.push(weekly);
  if (!windows.length) return null;
  return {
    windows,
    fiveHour,
    weekly,
    planLabel: parseKimiMembership(payload),
  };
}
