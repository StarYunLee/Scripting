import type { UsageWindowView } from "../models";

export type NormalizedResetCredits = {
  available: number;
  nearestExpiration: string | null;
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
};

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
            Number.isFinite(new Date(item.resetAt).getTime())))
      );
    },
  );
  const rawCredits = snapshot.resetCredits;
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
  return {
    available: effective,
    nearestExpiration: effective === 0 ? null : future[0]?.value || null,
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
  if (
    window.usedPercent == null &&
    window.remainingPercent == null &&
    !window.resetAt
  ) {
    return null;
  }
  return {
    id: window.id,
    label: window.label,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent,
    resetAt: window.resetAt,
  };
}
