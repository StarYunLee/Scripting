import type { LimitWindow, LimitWindowName } from "./types";

export type ParsedCopilotUsage = {
  windows: LimitWindow[];
  credits: LimitWindow | null;
  chat: LimitWindow | null;
  completions: LimitWindow | null;
  planLabel: string | null;
};

type QuotaDetail = Record<string, unknown>;

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
function resetFromPayload(payload: Record<string, unknown>): {
  iso: string | null;
  ms: number | null;
} {
  const raw =
    payload.quota_reset_date_utc ??
    payload.quota_reset_date ??
    payload.quotaResetDateUtc ??
    payload.quotaResetDate;
  if (typeof raw !== "string" || !raw.trim()) return { iso: null, ms: null };
  const trimmed = raw.trim();
  const ms = new Date(
    trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00Z`,
  ).getTime();
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}

export function formatCopilotPlanLabel(
  value: string | null | undefined,
  accessTypeSku?: string | null,
): string | null {
  const sku = (accessTypeSku || "").trim().toLowerCase();
  if (sku) {
    if (sku.includes("free")) return "Free";
    if (sku.includes("pro_plus") || sku.includes("proplus")) return "Pro+";
    if (sku.includes("enterprise")) return "Enterprise";
    if (sku.includes("business")) return "Business";
    if (sku.includes("pro") || sku.includes("trial")) return "Pro";
  }
  if (!value || !value.trim()) return null;
  const normalized = value
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/\+/g, "-plus")
    .toLowerCase();
  const labels: Record<string, string> = {
    free: "Free",
    individual: "Individual",
    "individual-pro": "Pro",
    pro: "Pro",
    "pro-plus": "Pro+",
    proplus: "Pro+",
    business: "Business",
    enterprise: "Enterprise",
  };
  return (
    labels[normalized] ||
    value
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function parseQuota(
  name: LimitWindowName,
  label: string,
  snapshot: QuotaDetail | null,
  reset: { iso: string | null; ms: number | null },
): LimitWindow | null {
  if (!snapshot || snapshot.unlimited === true) return null;
  const entitlement = toNumber(snapshot.entitlement);
  const remaining = toNumber(snapshot.remaining);
  const explicitRemainingPercent = toNumber(snapshot.percent_remaining);
  if (
    entitlement == null &&
    remaining == null &&
    explicitRemainingPercent == null
  )
    return null;
  if (
    (entitlement ?? 0) <= 0 &&
    (remaining ?? 0) <= 0 &&
    explicitRemainingPercent == null
  )
    return null;
  const derivedRemainingPercent =
    entitlement != null && entitlement > 0 && remaining != null
      ? (remaining / entitlement) * 100
      : null;
  // 无法从 percent_remaining 或 entitlement+remaining 推导时，禁止把「未知」写成 0%。
  const remainingPercent =
    explicitRemainingPercent != null
      ? clamp(explicitRemainingPercent)
      : derivedRemainingPercent != null
        ? clamp(derivedRemainingPercent)
        : null;
  if (remainingPercent == null) return null;
  return {
    id: `copilot:${name}`,
    name,
    label,
    usedPercent: clamp(100 - remainingPercent),
    remainingPercent,
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: 30 * 86400,
  };
}

export function parseCopilotUsage(
  payload: Record<string, unknown>,
): ParsedCopilotUsage | null {
  const snapshots = asObject(payload.quota_snapshots);
  if (!snapshots) return null;
  const reset = resetFromPayload(payload);
  const credits = parseQuota(
    "credits",
    "高级请求",
    asObject(snapshots.premium_interactions),
    reset,
  );
  const chat = parseQuota("chat", "聊天消息", asObject(snapshots.chat), reset);
  const completions = parseQuota(
    "completions",
    "代码补全",
    asObject(snapshots.completions),
    reset,
  );
  const windows = [credits, chat, completions].filter(
    (window): window is LimitWindow => window != null,
  );
  if (!windows.length) return null;
  return {
    windows,
    credits,
    chat,
    completions,
    planLabel: formatCopilotPlanLabel(
      typeof payload.copilot_plan === "string" ? payload.copilot_plan : null,
      typeof payload.access_type_sku === "string"
        ? payload.access_type_sku
        : null,
    ),
  };
}
