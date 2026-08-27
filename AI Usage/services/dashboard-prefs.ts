import type { UsageCard } from "../models";

export type DashboardPrefsScope = "app" | "widget";

const STORAGE_KEYS: Record<DashboardPrefsScope, string> = {
  app: "ai_usage_dashboard_prefs_v1",
  widget: "ai_usage_widget_dashboard_prefs_v1",
};

export type WidgetPrivacyPrefs = {
  showAccountEmail: boolean;
  showAccountId: boolean;
  showPlanBadge: boolean;
};

export type AppDashboardPrefs = {
  version: 1;
  hiddenAccountKeys: string[];
  hiddenWindowIdsByAccount: Record<string, string[]>;
};

export type WidgetDashboardPrefs = {
  version: 2;
  hiddenAccountKeys: string[];
  hiddenWindowIdsByAccount: Record<string, string[]>;
  privacy: WidgetPrivacyPrefs;
};

export type DashboardPrefs = AppDashboardPrefs | WidgetDashboardPrefs;

const DEFAULT_PRIVACY: WidgetPrivacyPrefs = {
  showAccountEmail: false,
  showAccountId: false,
  showPlanBadge: true,
};

function emptyAppPrefs(): AppDashboardPrefs {
  return {
    version: 1,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
  };
}

function emptyWidgetPrefs(): WidgetDashboardPrefs {
  return {
    version: 2,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
    privacy: { ...DEFAULT_PRIVACY },
  };
}

function emptyPrefs(scope: DashboardPrefsScope): DashboardPrefs {
  return scope === "widget" ? emptyWidgetPrefs() : emptyAppPrefs();
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim();
    if (cleaned) unique.add(cleaned);
  }
  return Array.from(unique);
}

function cleanHiddenWindows(raw: unknown): Record<string, string[]> {
  const cleaned: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return cleaned;
  for (const [rawKey, ids] of Object.entries(raw as Record<string, unknown>)) {
    const key = rawKey.trim();
    const values = cleanStrings(ids);
    if (key && values.length) cleaned[key] = values;
  }
  return cleaned;
}

function sanitizePrivacy(raw: unknown): WidgetPrivacyPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PRIVACY };
  }
  const value = raw as Record<string, unknown>;
  return {
    showAccountEmail: value.showAccountEmail === true,
    showAccountId: value.showAccountId === true,
    showPlanBadge: value.showPlanBadge !== false,
  };
}

export function sanitizeDashboardPrefs(raw: unknown): AppDashboardPrefs;
export function sanitizeDashboardPrefs(
  raw: unknown,
  scope: "app",
): AppDashboardPrefs;
export function sanitizeDashboardPrefs(
  raw: unknown,
  scope: "widget",
): WidgetDashboardPrefs;
export function sanitizeDashboardPrefs(
  raw: unknown,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyPrefs(scope);
  }
  const value = raw as Record<string, unknown>;
  const version = typeof value.version === "number" ? value.version : 1;
  const supported = scope === "widget" ? 2 : 1;
  if (version > supported) {
    throw new Error("总览偏好数据版本较新，请升级 AI Usage");
  }
  const common = {
    hiddenAccountKeys: cleanStrings(value.hiddenAccountKeys),
    hiddenWindowIdsByAccount: cleanHiddenWindows(
      value.hiddenWindowIdsByAccount,
    ),
  };
  return scope === "widget"
    ? {
        version: 2,
        ...common,
        privacy: sanitizePrivacy(value.privacy),
      }
    : { version: 1, ...common };
}

export function getDashboardPrefs(): AppDashboardPrefs;
export function getDashboardPrefs(scope: "app"): AppDashboardPrefs;
export function getDashboardPrefs(scope: "widget"): WidgetDashboardPrefs;
export function getDashboardPrefs(scope: DashboardPrefsScope): DashboardPrefs;
export function getDashboardPrefs(
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  let raw: unknown;
  try {
    raw = Storage.get<unknown>(STORAGE_KEYS[scope]);
  } catch {
    return emptyPrefs(scope);
  }
  return scope === "widget"
    ? sanitizeDashboardPrefs(raw, "widget")
    : sanitizeDashboardPrefs(raw, "app");
}

export function setDashboardPrefs(next: AppDashboardPrefs): AppDashboardPrefs;
export function setDashboardPrefs(
  next: AppDashboardPrefs,
  scope: "app",
): AppDashboardPrefs;
export function setDashboardPrefs(
  next: DashboardPrefs,
  scope: "widget",
): WidgetDashboardPrefs;
export function setDashboardPrefs(
  next: DashboardPrefs,
  scope: DashboardPrefsScope,
): DashboardPrefs;
export function setDashboardPrefs(
  next: DashboardPrefs,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  const cleaned =
    scope === "widget"
      ? sanitizeDashboardPrefs(next, "widget")
      : sanitizeDashboardPrefs(next, "app");
  try {
    Storage.set(STORAGE_KEYS[scope], cleaned);
  } catch {
    /* A display preference must never block the app when storage is unavailable. */
  }
  return cleaned;
}

export function getWidgetPrivacyPrefs(): WidgetPrivacyPrefs {
  return getDashboardPrefs("widget").privacy;
}

export function setWidgetPrivacyPrefs(
  patch: Partial<WidgetPrivacyPrefs>,
): WidgetDashboardPrefs {
  const prefs = getDashboardPrefs("widget");
  return setDashboardPrefs(
    {
      ...prefs,
      privacy: { ...prefs.privacy, ...patch },
    },
    "widget",
  );
}

export function setAccountVisibleOnDashboard(
  accountKey: string,
  visible: boolean,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  const prefs: DashboardPrefs = getDashboardPrefs(scope);
  const hidden = new Set(prefs.hiddenAccountKeys);
  if (visible) hidden.delete(accountKey);
  else hidden.add(accountKey);
  const next = { ...prefs, hiddenAccountKeys: Array.from(hidden) };
  return scope === "widget"
    ? setDashboardPrefs(next, "widget")
    : setDashboardPrefs(next as AppDashboardPrefs, "app");
}

export function setWindowVisibleOnDashboard(
  accountKey: string,
  windowId: string,
  visible: boolean,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  const prefs: DashboardPrefs = getDashboardPrefs(scope);
  const hidden = new Set(prefs.hiddenWindowIdsByAccount[accountKey] || []);
  if (visible) hidden.delete(windowId);
  else hidden.add(windowId);
  const hiddenWindowIdsByAccount = { ...prefs.hiddenWindowIdsByAccount };
  if (hidden.size) hiddenWindowIdsByAccount[accountKey] = Array.from(hidden);
  else delete hiddenWindowIdsByAccount[accountKey];
  const next = { ...prefs, hiddenWindowIdsByAccount };
  return scope === "widget"
    ? setDashboardPrefs(next, "widget")
    : setDashboardPrefs(next as AppDashboardPrefs, "app");
}

export function resetDashboardPrefs(
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  return scope === "widget"
    ? setDashboardPrefs(emptyWidgetPrefs(), "widget")
    : setDashboardPrefs(emptyAppPrefs(), "app");
}

export function applyDashboardPrefs(
  cards: UsageCard[],
  prefs: DashboardPrefs = getDashboardPrefs(),
): UsageCard[] {
  const hiddenAccounts = new Set(prefs.hiddenAccountKeys);
  return cards
    .filter((card) => !hiddenAccounts.has(card.key))
    .map((card) => {
      const hiddenWindows = new Set(
        prefs.hiddenWindowIdsByAccount[card.key] || [],
      );
      if (!hiddenWindows.size) return card;
      const windows = card.windows.filter(
        (window) => !hiddenWindows.has(window.id),
      );
      return windows.length === card.windows.length
        ? card
        : { ...card, windows };
    });
}
