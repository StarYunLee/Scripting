export type MinimaxAccountProfile = {
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
  accounts: MinimaxAccountProfile[];
};

/** 区域：国际站 api.minimax.io / 国内站 api.minimaxi.com */
export type MinimaxRegion = "intl" | "cn";

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
};

export type UsageSnapshot = {
  windows: LimitWindow[];
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  planType: string | null;
  planLabel: string | null;
  region: MinimaxRegion | null;
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

export type WidgetSettings = {
  reloadMinutes: number;
};
