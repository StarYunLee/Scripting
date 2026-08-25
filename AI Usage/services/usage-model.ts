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
