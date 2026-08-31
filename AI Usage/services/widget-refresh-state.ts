import type { ProviderId } from "../models";
import type { ProviderUsageError } from "../providers/contracts";
import {
  getWidgetRefreshMetadata,
  setWidgetRefreshMetadata,
  type WidgetRefreshMetadata,
} from "./widget-refresh-metadata";
import { widgetRefreshBackoff } from "./widget-refresh-planner";

export function nextWidgetRefreshFailure(
  current: WidgetRefreshMetadata,
  error: ProviderUsageError,
  at: string,
): WidgetRefreshMetadata {
  const failureCount = current.failureCount + 1;
  const unauthorized =
    error.code === "unauthorized" ||
    error.status === 401 ||
    error.status === 403;
  return {
    ...current,
    lastAttemptAt: at,
    lastFailureAt: at,
    failureCount,
    nextAutomaticAttemptAt: unauthorized
      ? null
      : widgetRefreshBackoff({
          failureCount,
          errorCode: error.code,
          status: error.status,
          retryAt: error.retryAt,
          now: new Date(at).getTime(),
        }),
    lastErrorCode: unauthorized ? "unauthorized" : error.code,
    lastHttpStatus: error.status || null,
  };
}

export function recordWidgetRefreshFailure(
  provider: ProviderId,
  profileId: string,
  error: ProviderUsageError,
  at = new Date().toISOString(),
): void {
  const current = getWidgetRefreshMetadata(provider, profileId);
  setWidgetRefreshMetadata(
    provider,
    profileId,
    nextWidgetRefreshFailure(current, error, at),
  );
}
