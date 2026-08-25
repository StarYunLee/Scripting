export type CodexAccountProfile = {
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
  accounts: CodexAccountProfile[];
};

export type LimitWindowName = "five_hour" | "weekly" | "monthly" | "unknown";

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

export type CodexCreditStatus = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

export type CodexSpendControl = {
  reached: boolean | null;
  individualLimit: {
    source: string | null;
    limit: string | null;
    used: string | null;
    remaining: string | null;
    usedPercent: number | null;
    remainingPercent: number | null;
    resetAt: string | null;
  } | null;
};

export type UsageSnapshot = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  monthly: LimitWindow | null;
  planType: string | null;
  planLabel: string | null;
  creditStatus?: CodexCreditStatus | null;
  spendControl?: CodexSpendControl | null;
  rateLimitAllowed?: boolean | null;
  rateLimitReached?: boolean | null;
  rateLimitReachedType?: string | null;
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

export type FocusWindow = "weekly" | "five_hour" | "monthly";
export type WidgetLayout = "detail" | "overview";

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
  watermarkSize: number;
  watermarkRight: number;
  watermarkBottom: number;
};

export type WidgetSettings = {
  focusWindow: FocusWindow;
  reloadMinutes: number;
  widgetLayout: WidgetLayout;
};
