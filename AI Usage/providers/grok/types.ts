export type GrokAccountProfile = {
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
  accounts: GrokAccountProfile[];
};

export type LimitWindowName =
  "five_hour" | "weekly" | "weekly_build" | "monthly" | "unknown";

export type LimitWindow = {
  id: string;
  name: LimitWindowName;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  resetAtMs: number | null;
  windowSeconds: number | null;
  limitValue?: number;
};

export type UsageSnapshot = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  weeklyBuild?: LimitWindow | null;
  monthly: LimitWindow | null;
  planType: string | null;
  planLabel: string | null;
  resetCreditsAvailable: number | null;
  resetCreditExpirations: string[];
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

export type ProviderBrand = "chatgpt" | "claude" | "grok";

export type MediumWidgetLayout = {
  left: number;
  right: number;
  topY: number;
  chipFont: number;
  chipHorizontal: number;
  chipVertical: number;
  titleY: number;
  titleFont: number;
  mainY: number;
  mainFont: number;
  suffixFont: number;
  progressY: number;
  progressHeight: number;
  footerY: number;
  footerIcon: number;
  footerLabelFont: number;
  footerValueFont: number;
  planY: number;
  planVertical: number;
  watermarkSize: number;
  watermarkRight: number;
  watermarkBottom: number;
};

export type WidgetSettings = {
  reloadMinutes: number;
  provider: ProviderBrand;
};
