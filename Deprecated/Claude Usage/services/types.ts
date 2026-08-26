export type ClaudeAccountProfile = {
  id: string
  name: string
  email: string | null
  accountId: string | null
  createdAt: string
  updatedAt: string
}

export type AccountRegistry = {
  version: 1
  defaultAccountId: string | null
  accounts: ClaudeAccountProfile[]
}

export type LimitWindowName = "five_hour" | "weekly" | "weekly_fable"

export type LimitWindow = {
  id: string
  name: LimitWindowName
  label: string
  usedPercent: number | null
  remainingPercent: number | null
  resetAt: string | null
  resetAtMs: number | null
  windowSeconds: number | null
}

export type UsageSnapshot = {
  windows: LimitWindow[]
  fiveHour: LimitWindow | null
  weekly: LimitWindow | null
  weeklyFable: LimitWindow | null
  planType: string | null
  planLabel: string | null
  fetchedAt: string
  source: "live" | "cache"
  raw: Record<string, unknown>
}

export type UsageErrorCode =
  | "missing_token"
  | "unauthorized"
  | "http_error"
  | "rate_limited"
  | "network_error"
  | "invalid_json"
  | "unknown"

export type UsageResult =
  | { ok: true; snapshot: UsageSnapshot }
  | {
      ok: false
      error: { code: UsageErrorCode; message: string; status?: number; detail?: string }
      cache?: UsageSnapshot | null
    }

export type DisplayMode = "used" | "remaining"
export type FocusWindow = "five_hour" | "weekly" | "weekly_fable"
export type WidgetStyle = "dual" | "single"
export type DualQuotaPreset = "five_hour_weekly" | "weekly_fable"
export type WidgetSettings = {
  displayMode: DisplayMode
  focusWindow: FocusWindow
  reloadMinutes: number
  widgetStyle: WidgetStyle
  dualQuotaPreset: DualQuotaPreset
}
