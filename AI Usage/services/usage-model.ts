import type { UsageBalanceView, UsageWindowView } from "../models";

export type NormalizedResetCredits = {
  available: number;
  nearestExpiration: string | null;
  expirations: string[];
};

export type NormalizedUsageSnapshot = {
  planLabel: string | null;
  windows: UsageWindowView[];
  resetCredits: NormalizedResetCredits | null;
  fetchedAt: string;
  source: "live" | "cache";
};

type UsageWindowLike = {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  kind?: UsageWindowView["kind"];
  detail?: string | null;
  balance?: UsageBalanceView;
};

/** 保留十进制字符串，金额不通过 Number 往返转换，也不把非法值补成 0。 */
function balanceDecimal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? text : null;
}

export function sanitizeUsageBalance(value: unknown): UsageBalanceView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<UsageBalanceView>;
  if (typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency) ||
      typeof item.isAvailable !== "boolean") return null;
  const total = balanceDecimal(item.total);
  if (total == null) return null;
  return {
    currency: item.currency,
    total,
    paid: balanceDecimal(item.paid),
    granted: balanceDecimal(item.granted),
    isAvailable: item.isAvailable,
  };
}

const WINDOW_KINDS = new Set(["quota", "balance", "status", "notice"]);

function windowKind(value: unknown): UsageWindowView["kind"] | undefined {
  return typeof value === "string" && WINDOW_KINDS.has(value)
    ? (value as UsageWindowView["kind"])
    : undefined;
}

export function sanitizeNormalizedUsageSnapshot(
  value: unknown,
): NormalizedUsageSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<NormalizedUsageSnapshot>;
  if (
    typeof snapshot.fetchedAt !== "string" ||
    !Number.isFinite(new Date(snapshot.fetchedAt).getTime()) ||
    (snapshot.source !== "live" && snapshot.source !== "cache") ||
    !Array.isArray(snapshot.windows)
  ) {
    return null;
  }
  const windows = snapshot.windows.filter(
    (window): window is UsageWindowView => {
      if (!window || typeof window !== "object") return false;
      const item = window as Partial<UsageWindowView>;
      const detail =
        typeof item.detail === "string" && item.detail.trim()
          ? item.detail.trim()
          : null;
      return (
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        typeof item.label === "string" &&
        item.label.trim().length > 0 &&
        (item.usedPercent == null ||
          (typeof item.usedPercent === "number" &&
            Number.isFinite(item.usedPercent))) &&
        (item.remainingPercent == null ||
          (typeof item.remainingPercent === "number" &&
            Number.isFinite(item.remainingPercent))) &&
        (item.resetAt == null ||
          (typeof item.resetAt === "string" &&
            Number.isFinite(new Date(item.resetAt).getTime()))) &&
        (item.usedPercent != null ||
          item.remainingPercent != null ||
          item.resetAt != null ||
          detail != null ||
          sanitizeUsageBalance(item.balance) != null)
      );
    },
  ).map((window) => {
    const detail =
      typeof window.detail === "string" && window.detail.trim()
        ? window.detail.trim()
        : null;
    const kind = windowKind(window.kind);
    const balance = sanitizeUsageBalance(window.balance);
    return {
      id: window.id,
      label: window.label,
      usedPercent: window.usedPercent ?? null,
      remainingPercent: window.remainingPercent ?? null,
      resetAt: window.resetAt ?? null,
      ...(kind ? { kind } : {}),
      ...(detail ? { detail } : {}),
      ...(balance ? { balance } : {}),
    };
  });
  const rawCredits = snapshot.resetCredits;
  const rawExpirations = Array.isArray(rawCredits?.expirations)
    ? rawCredits.expirations
        .filter(
          (value): value is string =>
            typeof value === "string" &&
            Number.isFinite(new Date(value).getTime()),
        )
        .map((value) => new Date(value).toISOString())
        .sort(
          (left, right) => new Date(left).getTime() - new Date(right).getTime(),
        )
    : [];
  const resetCredits =
    rawCredits &&
    typeof rawCredits.available === "number" &&
    Number.isFinite(rawCredits.available) &&
    (rawCredits.nearestExpiration == null ||
      (typeof rawCredits.nearestExpiration === "string" &&
        Number.isFinite(new Date(rawCredits.nearestExpiration).getTime())))
      ? {
          available: Math.max(0, Math.floor(rawCredits.available)),
          nearestExpiration: rawCredits.nearestExpiration,
          expirations: rawExpirations,
        }
      : null;
  return {
    planLabel:
      typeof snapshot.planLabel === "string" && snapshot.planLabel.trim()
        ? snapshot.planLabel.trim()
        : null,
    windows,
    resetCredits,
    fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
    source: snapshot.source,
  };
}

export function normalizeResetCredits(
  available: number | null | undefined,
  expirations: string[] | null | undefined,
): NormalizedResetCredits | null {
  const count =
    available == null || !Number.isFinite(available)
      ? null
      : Math.max(0, Math.floor(available));
  if (count == null) return null;

  const parsed = (expirations || [])
    .map((value) => ({ value, ms: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((left, right) => left.ms - right.ms);
  const future = parsed.filter((item) => item.ms > Date.now());
  const effective =
    parsed.length >= count ? Math.min(count, future.length) : count;
  const knownExpirations = future
    .slice(0, effective)
    .map((item) => new Date(item.ms).toISOString());
  return {
    available: effective,
    nearestExpiration: effective === 0 ? null : knownExpirations[0] || null,
    expirations: knownExpirations,
  };
}

export function isUsageWindowView(
  window: UsageWindowView | null,
): window is UsageWindowView {
  return window != null;
}

export function toUsageWindowView(
  window: UsageWindowLike,
): UsageWindowView | null {
  const detail =
    typeof window.detail === "string" && window.detail.trim()
      ? window.detail.trim()
      : null;
  const balance = sanitizeUsageBalance(window.balance);
  if (
    window.usedPercent == null &&
    window.remainingPercent == null &&
    !window.resetAt &&
    !detail &&
    !balance
  ) {
    return null;
  }
  const kind = windowKind(window.kind);
  return {
    id: window.id,
    label: window.label,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent,
    resetAt: window.resetAt,
    ...(kind ? { kind } : {}),
    ...(detail ? { detail } : {}),
    ...(balance ? { balance } : {}),
  };
}
