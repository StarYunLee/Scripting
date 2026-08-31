import { writeLog } from "../../services/logger";
import type { LimitWindow, LimitWindowName } from "./types";

export type ParsedZaiQuota = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  monthly: LimitWindow | null;
  planLabel: string | null;
};

/** Slot anchors used for nearest-window classification (seconds). */
const SLOT_SECONDS: Array<{
  name: Exclude<LimitWindowName, "web_search" | "unknown">;
  label: string;
  seconds: number;
}> = [
  { name: "five_hour", label: "5 小时", seconds: 5 * 3600 },
  { name: "weekly", label: "每周", seconds: 7 * 86400 },
  { name: "monthly", label: "每月", seconds: 30 * 86400 },
];

/**
 * Z.ai `unit` enum (undocumented; verified against CodexBar zai.js & tokn-provider-zai):
 * 1 = day, 3 = hour, 5 = month, 6 = week.
 * Note: older guesses treated unit 6 as "day"; live CREDIT_LIMIT weekly rows use (6, 1).
 */
const UNIT_SECONDS: Record<number, number> = {
  1: 86400,
  3: 3600,
  5: 30 * 86400,
  6: 7 * 86400,
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

function resetTime(value: unknown): { iso: string | null; ms: number | null } {
  const raw = toNumber(value);
  if (raw == null || raw <= 0) return { iso: null, ms: null };
  const ms = raw < 1e12 ? raw * 1000 : raw;
  const date = new Date(ms);
  return Number.isFinite(date.getTime())
    ? { iso: date.toISOString(), ms }
    : { iso: null, ms: null };
}

function logUnrecognized(message: string, code: string): void {
  writeLog({
    level: "warning",
    source: "app",
    category: "refresh",
    event: "zai.quota.unrecognized",
    provider: "zai",
    message,
    code,
  });
}

function tokenWindowKind(
  unit: number | null,
  number: number | null,
  type: string,
): { name: LimitWindowName; label: string; seconds: number } | null {
  if (unit == null || number == null || number <= 0) {
    logUnrecognized(
      `无法识别的额度窗口 type=${type} unit=${unit ?? "?"} number=${number ?? "?"}`,
      "unrecognized_window",
    );
    return null;
  }
  const unitSeconds = UNIT_SECONDS[unit];
  if (unitSeconds == null) {
    logUnrecognized(
      `未知 unit 编码 type=${type} unit=${unit} number=${number}`,
      "unknown_unit",
    );
    return null;
  }
  // Modern API: unit=6 means week → (6,1)=1 week. Legacy docs listed (6,7) as
  // a 7-day window; keep that pair on the weekly slot instead of 7 weeks.
  const seconds =
    unit === 6 && number === 7 ? 7 * 86400 : number * unitSeconds;
  let best = SLOT_SECONDS[0];
  let bestDelta = Math.abs(seconds - best.seconds);
  for (let i = 1; i < SLOT_SECONDS.length; i++) {
    const slot = SLOT_SECONDS[i];
    const delta = Math.abs(seconds - slot.seconds);
    if (delta < bestDelta) {
      best = slot;
      bestDelta = delta;
    }
  }
  return { name: best.name, label: best.label, seconds };
}

function timeLimitLabel(item: Record<string, unknown>): string {
  for (const key of ["name", "limitName", "description", "label", "title"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Web Search";
}

function limitWindow(
  item: Record<string, unknown>,
  index: number,
): LimitWindow | null {
  const type = String(item.type || "").toUpperCase();
  const percentage = toNumber(item.percentage);
  if (percentage == null) return null;

  let kind: { name: LimitWindowName; label: string; seconds: number } | null =
    null;
  if (type === "TOKENS_LIMIT" || type === "CREDIT_LIMIT") {
    kind = tokenWindowKind(toNumber(item.unit), toNumber(item.number), type);
  } else if (type === "TIME_LIMIT") {
    kind = {
      name: "web_search",
      label: timeLimitLabel(item),
      seconds: 30 * 86400,
    };
  } else {
    logUnrecognized(
      `未处理的额度类型 type=${type || "?"} unit=${item.unit ?? "?"} number=${item.number ?? "?"}`,
      "unknown_limit_type",
    );
    return null;
  }
  if (!kind) return null;

  const usedPercent = clamp(percentage);
  const reset = resetTime(item.nextResetTime);
  return {
    id: `zai:${kind.name}:${index}`,
    name: kind.name,
    label: kind.label,
    usedPercent,
    remainingPercent: clamp(100 - usedPercent),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: kind.seconds,
  };
}

const WINDOW_RANK: Record<LimitWindowName, number> = {
  five_hour: 0,
  weekly: 1,
  monthly: 2,
  web_search: 3,
  unknown: 4,
};

function extractPlanFromQuotaData(
  data: Record<string, unknown> | null,
): string | null {
  if (!data) return null;
  for (const key of ["planName", "plan", "plan_type", "packageName", "level"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return formatZaiPlanLabel(value);
    }
  }
  return null;
}

export function parseZaiQuota(payload: unknown): ParsedZaiQuota | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const limits = Array.isArray(data?.limits) ? data.limits : [];
  const windows: LimitWindow[] = [];
  for (const [index, item] of limits.entries()) {
    const record = asObject(item);
    const parsed = record ? limitWindow(record, index) : null;
    if (parsed) windows.push(parsed);
  }
  if (!windows.length) return null;
  windows.sort(
    (left, right) => WINDOW_RANK[left.name] - WINDOW_RANK[right.name],
  );
  const byName = (name: LimitWindowName) =>
    windows.find((window) => window.name === name) || null;
  return {
    windows,
    fiveHour: byName("five_hour"),
    weekly: byName("weekly"),
    monthly: byName("monthly"),
    planLabel: extractPlanFromQuotaData(data),
  };
}

function normalizePlanKey(value: string): string {
  return value
    .trim()
    .replace(/glm\s*coding\s*/i, "")
    .replace(/^plan[\s_-]*/i, "")
    .replace(/\+/g, " plus")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function titleCaseWords(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatZaiPlanLabel(
  value: string | null | undefined,
): string | null {
  if (!value || !value.trim()) return null;
  const normalized = normalizePlanKey(value);
  const labels: Record<string, string> = {
    free: "Free",
    lite: "Lite",
    pro: "Pro",
    max: "Max",
    "pro-plus": "Pro+",
    ultra: "Ultra",
  };
  if (labels[normalized]) return labels[normalized];
  if (/pro[\s_-]*(\+|plus\b)/i.test(value)) return "Pro+";
  const match = value.match(/\b(Lite|Pro|Max|Ultra|Free)\b/i);
  if (match)
    return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return titleCaseWords(value.trim());
}

function purchaseTimeMs(record: Record<string, unknown>): number {
  const raw = record.purchaseTime ?? record.purchase_time;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const numeric = toNumber(raw);
  if (numeric == null || numeric <= 0) return 0;
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

export function parseZaiSubscription(payload: unknown): string | null {
  const root = asObject(payload);
  const list = Array.isArray(root?.data) ? root.data : [];
  const candidates: Array<{
    label: string;
    inCurrent: boolean;
    purchaseTime: number;
  }> = [];

  for (const item of list) {
    const record = asObject(item);
    if (!record) continue;
    const status = String(record.status || "").toUpperCase();
    const inCurrent = record.inCurrentPeriod === true;
    if (status && status !== "VALID" && !inCurrent) continue;
    const name =
      typeof record.productName === "string"
        ? record.productName
        : typeof record.product_name === "string"
          ? record.product_name
          : null;
    const label = formatZaiPlanLabel(name);
    if (!label) continue;
    candidates.push({
      label,
      inCurrent,
      purchaseTime: purchaseTimeMs(record),
    });
  }

  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    if (left.inCurrent !== right.inCurrent) return left.inCurrent ? -1 : 1;
    return right.purchaseTime - left.purchaseTime;
  });
  return candidates[0].label;
}
