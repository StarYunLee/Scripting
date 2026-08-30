import type { UsageCard } from "../models";

const STORAGE_KEY = "ai_usage_dashboard_widget_preferences_v1";

export type DashboardWidgetDisplayPreferences = {
  showAccountLabel: boolean;
};

export type DashboardWidgetPreferences = {
  version: 1;
  hiddenAccountKeys: string[];
  accountOrder: string[];
  windowIdsByAccount: Record<string, string[]>;
  display: DashboardWidgetDisplayPreferences;
};

const DEFAULT_DISPLAY: DashboardWidgetDisplayPreferences = {
  showAccountLabel: false,
};

const DEFAULT_PREFERENCES: DashboardWidgetPreferences = {
  version: 1,
  hiddenAccountKeys: [],
  accountOrder: [],
  windowIdsByAccount: {},
  display: { ...DEFAULT_DISPLAY },
};

// App 页面内连续点击 Toggle/Picker 时，优先使用已确认的本地快照，
// 避免下一次事件在 Storage 跨进程落盘前又读回旧值。
let inMemoryPreferences: DashboardWidgetPreferences | null = null;

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      ),
    ),
  ];
}

export function sanitizeDashboardWidgetPreferences(
  raw: unknown,
): DashboardWidgetPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PREFERENCES, display: { ...DEFAULT_DISPLAY } };
  }
  const value = raw as Record<string, unknown>;
  const windowIdsByAccount: Record<string, string[]> = {};
  if (
    value.windowIdsByAccount &&
    typeof value.windowIdsByAccount === "object" &&
    !Array.isArray(value.windowIdsByAccount)
  ) {
    for (const [accountKey, windowIds] of Object.entries(
      value.windowIdsByAccount as Record<string, unknown>,
    )) {
      if (!accountKey.trim() || !Array.isArray(windowIds)) continue;
      windowIdsByAccount[accountKey] = strings(windowIds).slice(0, 2);
    }
  }
  const display =
    value.display && typeof value.display === "object"
      ? (value.display as Record<string, unknown>)
      : {};
  return {
    version: 1,
    hiddenAccountKeys: strings(value.hiddenAccountKeys),
    accountOrder: strings(value.accountOrder),
    windowIdsByAccount,
    display: {
      showAccountLabel: display.showAccountLabel === true,
    },
  };
}

export function getDashboardWidgetPreferences(): DashboardWidgetPreferences {
  if (inMemoryPreferences) return inMemoryPreferences;
  try {
    const next = sanitizeDashboardWidgetPreferences(Storage.get(STORAGE_KEY));
    inMemoryPreferences = next;
    return next;
  } catch {
    const fallback = {
      ...DEFAULT_PREFERENCES,
      display: { ...DEFAULT_DISPLAY },
    };
    inMemoryPreferences = fallback;
    return fallback;
  }
}

export function setDashboardWidgetPreferences(
  value: DashboardWidgetPreferences,
): DashboardWidgetPreferences {
  const next = sanitizeDashboardWidgetPreferences(value);
  inMemoryPreferences = next;
  try {
    Storage.set(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

export function setDashboardWidgetAccountVisible(
  accountKey: string,
  visible: boolean,
): DashboardWidgetPreferences {
  const preferences = getDashboardWidgetPreferences();
  const hidden = new Set(preferences.hiddenAccountKeys);
  if (visible) hidden.delete(accountKey);
  else hidden.add(accountKey);
  return setDashboardWidgetPreferences({
    ...preferences,
    hiddenAccountKeys: [...hidden],
  });
}

export function setDashboardWidgetAccountWindows(
  accountKey: string,
  windowIds: string[],
): DashboardWidgetPreferences {
  const preferences = getDashboardWidgetPreferences();
  return setDashboardWidgetPreferences({
    ...preferences,
    windowIdsByAccount: {
      ...preferences.windowIdsByAccount,
      [accountKey]: strings(windowIds).slice(0, 2),
    },
  });
}

export function setDashboardWidgetDisplayPreferences(
  patch: Partial<DashboardWidgetDisplayPreferences>,
): DashboardWidgetPreferences {
  const preferences = getDashboardWidgetPreferences();
  return setDashboardWidgetPreferences({
    ...preferences,
    display: { ...preferences.display, ...patch },
  });
}

export function applyDashboardWidgetPreferences(
  cards: UsageCard[],
  preferences = getDashboardWidgetPreferences(),
): UsageCard[] {
  const hidden = new Set(preferences.hiddenAccountKeys);
  const order = new Map(
    preferences.accountOrder.map((key, index) => [key, index]),
  );
  return cards
    .filter((card) => !hidden.has(card.key))
    .map((card) => {
      const hasSelection = Object.prototype.hasOwnProperty.call(
        preferences.windowIdsByAccount,
        card.key,
      );
      const selectedIds = preferences.windowIdsByAccount[card.key] || [];
      const selected = selectedIds
        .map((id) => card.windows.find((window) => window.id === id))
        .filter((window): window is UsageCard["windows"][number] =>
          Boolean(window),
        );
      const windows = hasSelection
        ? selected.length
          ? selected
          : card.windows.slice(0, 2)
        : card.windows.slice(0, 2);
      return { ...card, windows: windows.slice(0, 2) };
    })
    .sort(
      (left, right) =>
        (order.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function clearDashboardWidgetAccountPreferences(
  accountKey: string,
): void {
  const preferences = getDashboardWidgetPreferences();
  preferences.hiddenAccountKeys = preferences.hiddenAccountKeys.filter(
    (key) => key !== accountKey,
  );
  preferences.accountOrder = preferences.accountOrder.filter(
    (key) => key !== accountKey,
  );
  delete preferences.windowIdsByAccount[accountKey];
  setDashboardWidgetPreferences(preferences);
}
