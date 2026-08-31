import type { WidgetRefreshMetadata } from "./widget-refresh-metadata";

export type WidgetRefreshPlan =
  | { action: "fetch"; reason: "missing_cache" | "stale" }
  | {
      action: "use_cache";
      reason: "fresh" | "backoff" | "authorization_required";
      retryAt?: string;
    };

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function planWidgetAutomaticRefresh(input: {
  fetchedAt: string | null;
  reloadMinutes: number;
  metadata: WidgetRefreshMetadata;
  now?: number;
}): WidgetRefreshPlan {
  const now = input.now ?? Date.now();
  const fetchedAt = time(input.fetchedAt);
  const nextAttempt = time(input.metadata.nextAutomaticAttemptAt);
  if (input.metadata.lastErrorCode === "unauthorized") {
    return { action: "use_cache", reason: "authorization_required" };
  }
  if (nextAttempt != null && nextAttempt > now) {
    return {
      action: "use_cache",
      reason: "backoff",
      retryAt: new Date(nextAttempt).toISOString(),
    };
  }
  if (fetchedAt == null) return { action: "fetch", reason: "missing_cache" };
  // 0 = 手动：小组件不自动联网，仅展示缓存。
  if (input.reloadMinutes <= 0) {
    return { action: "use_cache", reason: "fresh" };
  }
  const interval = Math.max(5, Math.min(360, input.reloadMinutes)) * 60_000;
  if (now - fetchedAt < interval) {
    return { action: "use_cache", reason: "fresh" };
  }
  return { action: "fetch", reason: "stale" };
}

export function widgetRefreshBackoff(input: {
  failureCount: number;
  errorCode: string | null;
  status?: number;
  retryAt?: string | null;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  if (
    input.errorCode === "unauthorized" ||
    input.status === 401 ||
    input.status === 403
  )
    return null;
  const explicit = time(input.retryAt);
  if (input.status === 429 && explicit != null && explicit > now)
    return new Date(explicit).toISOString();
  const count = Math.max(1, Math.floor(input.failureCount));
  const minutes =
    input.status === 429
      ? 30
      : count <= 1
        ? 5
        : count === 2
          ? 15
          : count === 3
            ? 30
            : 60;
  return new Date(now + minutes * 60_000).toISOString();
}

export function widgetRefreshStatusText(input: {
  fetchedAt: string | null;
  metadata: WidgetRefreshMetadata;
  now?: number;
}): string | undefined {
  const now = input.now ?? Date.now();
  if (input.metadata.lastErrorCode === "unauthorized") return "授权已失效";
  const nextAttempt = time(input.metadata.nextAutomaticAttemptAt);
  if (
    input.metadata.lastErrorCode &&
    input.metadata.lastFailureAt &&
    nextAttempt != null &&
    nextAttempt > now
  ) {
    return input.metadata.lastHttpStatus === 429
      ? "接口限流，稍后重试"
      : "自动刷新失败";
  }
  const fetchedAt = time(input.fetchedAt);
  if (fetchedAt != null && now - fetchedAt >= 6 * 60 * 60_000)
    return "数据较旧";
  return undefined;
}
