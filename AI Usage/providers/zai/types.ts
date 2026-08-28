export type ZaiAccountProfile = {
  id: string;
  name: string;
  email: string | null;
  accountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountRegistry = {
  version: 1;
  defaultAccountId: string | null;
  accounts: ZaiAccountProfile[];
};

export type ZaiRegion = "intl" | "cn";

export type LimitWindowName =
  "five_hour" | "weekly" | "monthly" | "web_search" | "unknown";

export type LimitWindow = {
  id: string;
  name: LimitWindowName;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  resetAtMs: number | null;
  windowSeconds: number | null;
};

export type UsageSnapshot = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  monthly: LimitWindow | null;
  planType: string | null;
  planLabel: string | null;
  region: ZaiRegion | null;
  fetchedAt: string;
  source: "live" | "cache";
};

export type UsageErrorCode =
  | "missing_token"
  | "unauthorized"
  | "http_error"
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

export type FocusWindow = "five_hour" | "weekly" | "monthly" | "web_search";
export type WidgetStyle = "dual" | "single";
export type DualQuotaPreset =
  "five_hour_weekly" | "five_hour_monthly" | "weekly_monthly";
export type WidgetSettings = {
  focusWindow: FocusWindow;
  reloadMinutes: number;
  widgetStyle: WidgetStyle;
  dualQuotaPreset: DualQuotaPreset;
};
