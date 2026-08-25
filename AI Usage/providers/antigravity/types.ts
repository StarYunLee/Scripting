export type AntigravityAccountProfile = {
  id: string;
  name: string;
  email: string | null;
  accountId: string | null;
  projectId: string | null;
  planLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountRegistry = {
  version: 1;
  defaultAccountId: string | null;
  accounts: AntigravityAccountProfile[];
};

export type LimitWindowName = "five_hour" | "weekly" | "unknown";

export type LimitWindow = {
  id: string;
  name: LimitWindowName;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  resetAtMs: number | null;
  windowSeconds: number | null;
  source: "quota_summary" | "available_models";
};

export type UsageSnapshot = {
  windows: LimitWindow[];
  planType: string | null;
  planLabel: string | null;
  projectId: string | null;
  fetchedAt: string;
  source: "live" | "cache";
};

export type AntigravityProjectInfo = {
  projectId: string | null;
  planLabel: string | null;
  tierId: string | null;
};

export type FocusWindow = "gemini_weekly" | "third_party_weekly";
export type WidgetStyle = "dual" | "single";
export type DualQuotaPreset =
  "gemini_five_hour_weekly" | "third_party_five_hour_weekly" | "weekly_both";
export type WidgetSettings = {
  focusWindow: FocusWindow;
  reloadMinutes: number;
  widgetStyle: WidgetStyle;
  dualQuotaPreset: DualQuotaPreset;
};

export type UsageErrorCode =
  | "missing_token"
  | "unauthorized"
  | "http_error"
  | "rate_limited"
  | "network_error"
  | "invalid_json"
  | "unknown";

export type UsageResult =
  | { ok: true; snapshot: UsageSnapshot }
  | {
      ok: false;
      error: {
        code: UsageErrorCode;
        message: string;
        status?: number;
        detail?: string;
      };
      cache?: UsageSnapshot | null;
    };
