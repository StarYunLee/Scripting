import type { UsageCard } from "../models";

const STORAGE_KEY = "ai_usage_dashboard_prefs_v1";

export type DashboardPrefs = {
  version: 1;
  hiddenAccountKeys: string[];
  hiddenWindowIdsByAccount: Record<string, string[]>;
};

const DEFAULT_PREFS: DashboardPrefs = {
  version: 1,
  hiddenAccountKeys: [],
  hiddenWindowIdsByAccount: {},
};

function emptyPrefs(): DashboardPrefs {
  return {
    version: 1,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
  };
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

export function sanitizeDashboardPrefs(raw: unknown): DashboardPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyPrefs();
  const value = raw as Record<string, unknown>;
  if (typeof value.version === "number" && value.version > 1) {
    throw new Error("总览偏好数据版本较新，请升级 AI Usage");
  }
  const hiddenWindowIdsByAccount: Record<string, string[]> = {};
  const windows = value.hiddenWindowIdsByAccount;
  if (windows && typeof windows === "object" && !Array.isArray(windows)) {
    for (const [rawKey, ids] of Object.entries(
      windows as Record<string, unknown>,
    )) {
      const key = rawKey.trim();
      const cleaned = cleanStrings(ids);
      if (key && cleaned.length) hiddenWindowIdsByAccount[key] = cleaned;
    }
  }
  return {
    version: DEFAULT_PREFS.version,
    hiddenAccountKeys: cleanStrings(value.hiddenAccountKeys),
    hiddenWindowIdsByAccount,
  };
}

export function getDashboardPrefs(): DashboardPrefs {
  let raw: unknown;
  try {
    raw = Storage.get<unknown>(STORAGE_KEY);
  } catch {
    return emptyPrefs();
  }
  return sanitizeDashboardPrefs(raw);
}

export function setDashboardPrefs(next: DashboardPrefs): DashboardPrefs {
  const cleaned = sanitizeDashboardPrefs(next);
  try {
    Storage.set(STORAGE_KEY, cleaned);
  } catch {
    /* A display preference must never block the app when storage is unavailable. */
  }
  return cleaned;
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
  const hiddenWindowIdsByAccount = { ...prefs.hiddenWindowIdsByAccount };
  if (hidden.size) hiddenWindowIdsByAccount[accountKey] = Array.from(hidden);
  else delete hiddenWindowIdsByAccount[accountKey];
  return setDashboardPrefs({ ...prefs, hiddenWindowIdsByAccount });
}

export function resetDashboardPrefs(): DashboardPrefs {
  return setDashboardPrefs(emptyPrefs());
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
