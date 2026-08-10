export type GrokAccountProfile = {
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
  accounts: GrokAccountProfile[]
}

export type LimitWindowName = "five_hour" | "weekly" | "monthly" | "unknown"

export type LimitWindow = {
  id: string
  name: LimitWindowName
  label: string
  usedPercent: number | null
  remainingPercent: number | null
  resetAt: string | null
  resetAtMs: number | null
  windowSeconds: number | null
  usedValue?: number
  limitValue?: number
  unit?: "credits"
}

export type UsageSnapshot = {
  windows: LimitWindow[]
  fiveHour: LimitWindow | null
  weekly: LimitWindow | null
  monthly: LimitWindow | null
  planType: string | null
  planLabel: string | null
  subscriptionExpiresAt: string | null
  fetchedAt: string
  source: "live" | "cache"
  raw: Record<string, unknown>
}

export type UsageErrorCode =
  | "missing_token"
  | "unauthorized"
  | "http_error"
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
export type FocusWindow = "weekly" | "monthly"
export type WidgetLayout = "detail" | "overview"

export type WidgetSettings = {
  displayMode: DisplayMode
  focusWindow: FocusWindow
  reloadMinutes: number
  widgetLayout: WidgetLayout
}
