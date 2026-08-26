import type { UsageCard } from "../models";

const STORAGE_KEY = "ai_usage_dashboard_prefs_v1";

export type DashboardPrefs = {
  version: 1;
  /** 在总览中隐藏的账号 key：`provider:accountId` */
  hiddenAccountKeys: string[];
  /** 按账号隐藏的额度窗口 id */
  hiddenWindowIdsByAccount: Record<string, string[]>;
};

const EMPTY: DashboardPrefs = {
  version: 1,
  hiddenAccountKeys: [],
  hiddenWindowIdsByAccount: {},
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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
    version: 1,
    hiddenAccountKeys: asStringArray(value.hiddenAccountKeys),
    hiddenWindowIdsByAccount,
  };
}

export function getDashboardPrefs(): DashboardPrefs {
  try {
    return sanitize(Storage.get<DashboardPrefs>(STORAGE_KEY));
  } catch {
    return { ...EMPTY };
  }
}

export function setDashboardPrefs(next: DashboardPrefs): DashboardPrefs {
  const cleaned = sanitize(next);
  try {
    Storage.set(STORAGE_KEY, cleaned);
  } catch {
    /* ignore */
  }
  return cleaned;
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
): DashboardPrefs {
  const prefs = getDashboardPrefs();
  const hidden = new Set(prefs.hiddenAccountKeys);
  if (visible) hidden.delete(accountKey);
  else hidden.add(accountKey);
  return setDashboardPrefs({
    ...prefs,
    hiddenAccountKeys: Array.from(hidden),
  });
}

export function setWindowVisibleOnDashboard(
  accountKey: string,
  windowId: string,
  visible: boolean,
): DashboardPrefs {
  const prefs = getDashboardPrefs();
  const hidden = new Set(prefs.hiddenWindowIdsByAccount[accountKey] || []);
  if (visible) hidden.delete(windowId);
  else hidden.add(windowId);
  const nextWindows = { ...prefs.hiddenWindowIdsByAccount };
  if (hidden.size) nextWindows[accountKey] = Array.from(hidden);
  else delete nextWindows[accountKey];
  return setDashboardPrefs({
    ...prefs,
    hiddenWindowIdsByAccount: nextWindows,
  });
}

export function resetDashboardPrefs(): DashboardPrefs {
  return setDashboardPrefs({ ...EMPTY });
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
