import type { ProviderId } from "../models";

const STORAGE_PREFIX = "ai_usage_widget_refresh_meta_v1_";

export type WidgetRefreshMetadata = {
  version: 1;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  nextAutomaticAttemptAt: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
};

const EMPTY_METADATA: WidgetRefreshMetadata = {
  version: 1,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  failureCount: 0,
  nextAutomaticAttemptAt: null,
  lastErrorCode: null,
  lastHttpStatus: null,
};

function key(provider: ProviderId, profileId: string): string {
  return `${STORAGE_PREFIX}${provider}_${profileId}`;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function sanitizeWidgetRefreshMetadata(
  value: unknown,
): WidgetRefreshMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_METADATA };
  }
  const metadata = value as Partial<WidgetRefreshMetadata>;
  const failureCount =
    typeof metadata.failureCount === "number" &&
    Number.isFinite(metadata.failureCount)
      ? Math.max(0, Math.floor(metadata.failureCount))
      : 0;
  return {
    version: 1,
    lastAttemptAt: iso(metadata.lastAttemptAt),
    lastSuccessAt: iso(metadata.lastSuccessAt),
    lastFailureAt: iso(metadata.lastFailureAt),
    failureCount,
    nextAutomaticAttemptAt: iso(metadata.nextAutomaticAttemptAt),
    lastErrorCode:
      typeof metadata.lastErrorCode === "string" && metadata.lastErrorCode
        ? metadata.lastErrorCode
        : null,
    lastHttpStatus:
      typeof metadata.lastHttpStatus === "number" &&
      Number.isFinite(metadata.lastHttpStatus)
        ? Math.floor(metadata.lastHttpStatus)
        : null,
  };
}

export type RefreshMetadataUpdate = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  nextAutomaticAttemptAt: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
};

export function recordWidgetRefreshSuccess(
  provider: ProviderId,
  profileId: string,
  at: string,
): boolean {
  return setWidgetRefreshMetadata(provider, profileId, {
    version: 1,
    lastAttemptAt: at,
    lastSuccessAt: at,
    lastFailureAt: null,
    failureCount: 0,
    nextAutomaticAttemptAt: null,
    lastErrorCode: null,
    lastHttpStatus: null,
  });
}

export function getWidgetRefreshMetadata(
  provider: ProviderId,
  profileId: string,
): WidgetRefreshMetadata {
  try {
    return sanitizeWidgetRefreshMetadata(Storage.get(key(provider, profileId)));
  } catch {
    return { ...EMPTY_METADATA };
  }
}

export function setWidgetRefreshMetadata(
  provider: ProviderId,
  profileId: string,
  value: WidgetRefreshMetadata,
): boolean {
  try {
    return Storage.set(
      key(provider, profileId),
      sanitizeWidgetRefreshMetadata(value),
    );
  } catch {
    return false;
  }
}

export function clearWidgetRefreshMetadata(
  provider: ProviderId,
  profileId: string,
): void {
  try {
    Storage.remove(key(provider, profileId));
  } catch {
    /* best effort */
  }
}
