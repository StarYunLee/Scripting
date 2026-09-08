import {
  planWidgetAutomaticRefresh,
  type WidgetRefreshPlan,
} from "./widget-refresh-planner";
import type { WidgetRefreshMetadata } from "./widget-refresh-metadata";
/** Manual requests bypass freshness, never an active server rate-limit. */
export function planUsageRefresh(input: {
  fetchedAt: string | null;
  reloadMinutes: number;
  metadata: WidgetRefreshMetadata;
  now?: number;
  force?: boolean;
}): WidgetRefreshPlan {
  const now = input.now ?? Date.now();
  const retryAt = input.metadata.nextAutomaticAttemptAt;
  if (input.force) {
    if (
      input.metadata.lastHttpStatus === 429 &&
      retryAt &&
      new Date(retryAt).getTime() > now
    ) {
      return { action: "use_cache", reason: "backoff", retryAt };
    }
    return { action: "fetch", reason: "stale" };
  }
  return planWidgetAutomaticRefresh(input);
}
export function parseUsageRetryAfter(
  value: string | null,
  now = Date.now(),
): string | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const numeric = Number(raw);
  const at = Number.isFinite(numeric)
    ? now + Math.max(0, numeric) * 1000
    : Date.parse(raw);
  return Number.isFinite(at) && at > now
    ? new Date(at).toISOString()
    : undefined;
}
