import type { LimitWindow, LimitWindowName } from "./types";

export type ParsedZaiQuota = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  monthly: LimitWindow | null;
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

function tokenWindowKind(
  unit: number | null,
  number: number | null,
): { name: LimitWindowName; label: string; seconds: number } | null {
  if (unit === 3 && number === 5)
    return { name: "five_hour", label: "5 小时", seconds: 5 * 3600 };
  if (unit === 6 && number === 7)
    return { name: "weekly", label: "每周", seconds: 7 * 86400 };
  if (unit === 5 && number === 1)
    return { name: "monthly", label: "每月", seconds: 30 * 86400 };
  return null;
}

function limitWindow(
  item: Record<string, unknown>,
  index: number,
): LimitWindow | null {
  const type = String(item.type || "").toUpperCase();
  const percentage = toNumber(item.percentage);
  if (percentage == null) return null;
  const kind =
    type === "TOKENS_LIMIT"
      ? tokenWindowKind(toNumber(item.unit), toNumber(item.number))
      : type === "TIME_LIMIT"
        ? {
            name: "web_search" as const,
            label: "Web Search",
            seconds: 30 * 86400,
          }
        : null;
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

export function parseZaiSubscription(payload: unknown): string | null {
  const root = asObject(payload);
  const list = Array.isArray(root?.data) ? root.data : [];
  for (const item of list) {
    const record = asObject(item);
    if (!record) continue;
    const status = String(record.status || "").toUpperCase();
    if (status && status !== "VALID" && record.inCurrentPeriod !== true)
      continue;
    const name =
      typeof record.productName === "string"
        ? record.productName
        : typeof record.product_name === "string"
          ? record.product_name
          : null;
    const label = formatZaiPlanLabel(name);
    if (label) return label;
  }
  return null;
}
