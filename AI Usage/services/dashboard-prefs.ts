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

export type DashboardPrefs = {
  version: 2;
  /** 在总览中隐藏的账号 key：`provider:accountId` */
  hiddenAccountKeys: string[];
  /** 按账号隐藏的额度窗口 id */
  hiddenWindowIdsByAccount: Record<string, string[]>;
  /** 仅总览小组件使用的隐私显示选项 */
  privacy: WidgetPrivacyPrefs;
};

const DEFAULT_PRIVACY: WidgetPrivacyPrefs = {
  showAccountEmail: false,
  showAccountId: false,
  showPlanBadge: true,
};

const EMPTY: DashboardPrefs = {
  version: 2,
  hiddenAccountKeys: [],
  hiddenWindowIdsByAccount: {},
  privacy: { ...DEFAULT_PRIVACY },
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizePrivacy(raw: unknown): WidgetPrivacyPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PRIVACY };
  const value = raw as Record<string, unknown>;
  return {
    showAccountEmail: value.showAccountEmail === true,
    showAccountId: value.showAccountId === true,
    showPlanBadge: value.showPlanBadge !== false,
  };
}

function sanitize(raw: unknown): DashboardPrefs {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const value = raw as Record<string, unknown>;
  const hiddenWindowIdsByAccount: Record<string, string[]> = {};
  const windowsRaw = value.hiddenWindowIdsByAccount;
  if (windowsRaw && typeof windowsRaw === "object" && !Array.isArray(windowsRaw)) {
    for (const [key, ids] of Object.entries(
      windowsRaw as Record<string, unknown>,
    )) {
      if (!key.trim()) continue;
      const cleaned = asStringArray(ids);
      if (cleaned.length) hiddenWindowIdsByAccount[key] = cleaned;
    }
  }
  return {
    version: 2,
    hiddenAccountKeys: asStringArray(value.hiddenAccountKeys),
    hiddenWindowIdsByAccount,
    privacy: sanitizePrivacy(value.privacy),
  };
}

export function getDashboardPrefs(
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  try {
    return sanitize(Storage.get<DashboardPrefs>(STORAGE_KEYS[scope]));
  } catch {
    return { ...EMPTY };
  }
}

export function getWidgetPrivacyPrefs(): WidgetPrivacyPrefs {
  return getDashboardPrefs("widget").privacy;
}

export function setDashboardPrefs(
  next: DashboardPrefs,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  const cleaned = sanitize(next);
  try {
    Storage.set(STORAGE_KEYS[scope], cleaned);
  } catch {
    /* ignore */
  }
  return cleaned;
}

export function setWidgetPrivacyPrefs(
  patch: Partial<WidgetPrivacyPrefs>,
): DashboardPrefs {
  const prefs = getDashboardPrefs("widget");
  return setDashboardPrefs(
    {
      ...prefs,
      privacy: {
        ...prefs.privacy,
        ...patch,
      },
    },
    "widget",
  );
}

export function isAccountVisibleOnDashboard(
  accountKey: string,
  prefs: DashboardPrefs = getDashboardPrefs(),
): boolean {
  return !prefs.hiddenAccountKeys.includes(accountKey);
}

export function isWindowVisibleOnDashboard(
  accountKey: string,
  windowId: string,
  prefs: DashboardPrefs = getDashboardPrefs(),
): boolean {
  const hidden = prefs.hiddenWindowIdsByAccount[accountKey] || [];
  return !hidden.includes(windowId);
}

export function setAccountVisibleOnDashboard(
  accountKey: string,
  visible: boolean,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  const prefs = getDashboardPrefs(scope);
  const hidden = new Set(prefs.hiddenAccountKeys);
  if (visible) hidden.delete(accountKey);
  else hidden.add(accountKey);
  return setDashboardPrefs(
    {
      ...prefs,
      hiddenAccountKeys: Array.from(hidden),
    },
    scope,
  );
}

export function setWindowVisibleOnDashboard(
  accountKey: string,
  windowId: string,
  visible: boolean,
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  const prefs = getDashboardPrefs(scope);
  const hidden = new Set(prefs.hiddenWindowIdsByAccount[accountKey] || []);
  if (visible) hidden.delete(windowId);
  else hidden.add(windowId);
  const nextWindows = { ...prefs.hiddenWindowIdsByAccount };
  if (hidden.size) nextWindows[accountKey] = Array.from(hidden);
  else delete nextWindows[accountKey];
  return setDashboardPrefs(
    {
      ...prefs,
      hiddenWindowIdsByAccount: nextWindows,
    },
    scope,
  );
}

export function resetDashboardPrefs(
  scope: DashboardPrefsScope = "app",
): DashboardPrefs {
  return setDashboardPrefs({ ...EMPTY }, scope);
}

/** 按总览偏好过滤账号与额度条目；默认全部可见。 */
export function applyDashboardPrefs(
  cards: UsageCard[],
  prefs: DashboardPrefs = getDashboardPrefs(),
): UsageCard[] {
  return cards
    .filter((card) => isAccountVisibleOnDashboard(card.key, prefs))
    .map((card) => {
      const windows = card.windows.filter((window) =>
        isWindowVisibleOnDashboard(card.key, window.id, prefs),
      );
      if (windows.length === card.windows.length) return card;
      return { ...card, windows };
    });
}
