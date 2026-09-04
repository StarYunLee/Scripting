import type { UsageCard } from "../models";

const LIVE_STORAGE_KEY = "ai_usage_dashboard_widget_preferences_v1";
const DEMO_STORAGE_KEY = "ai_usage_demo_dashboard_widget_preferences_v1";

export type DashboardPreferenceScope = "live" | "demo";

function storageKey(scope: DashboardPreferenceScope): string {
  return scope === "demo" ? DEMO_STORAGE_KEY : LIVE_STORAGE_KEY;
}

function isDemoAccountKey(key: string): boolean {
  const separator = key.indexOf(":");
  return separator >= 0 && key.slice(separator + 1).startsWith("demo_");
}

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
// 避免下一次事件在 Storage 异步落盘前又读回旧值。
// Widget 进程可能复用 JS 运行时：时间线重建必须走 readDashboardWidgetPreferences()，
// 不得使用这份快照，否则会一直显示改配置前的账号/额度窗口。
const inMemoryPreferences: Partial<
  Record<DashboardPreferenceScope, DashboardWidgetPreferences>
> = {};

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

function preferencesForScope(
  preferences: DashboardWidgetPreferences,
  scope: DashboardPreferenceScope,
): DashboardWidgetPreferences {
  const keep = (key: string) =>
    scope === "demo" ? isDemoAccountKey(key) : !isDemoAccountKey(key);
  return {
    ...preferences,
    hiddenAccountKeys: preferences.hiddenAccountKeys.filter(keep),
    accountOrder: preferences.accountOrder.filter(keep),
    windowIdsByAccount: Object.fromEntries(
      Object.entries(preferences.windowIdsByAccount).filter(([key]) =>
        keep(key),
      ),
    ),
  };
}

function hasAccountEntries(preferences: DashboardWidgetPreferences): boolean {
  return (
    preferences.hiddenAccountKeys.length > 0 ||
    preferences.accountOrder.length > 0 ||
    Object.keys(preferences.windowIdsByAccount).length > 0
  );
}

function migrateLegacyDashboardPreferences(): void {
  try {
    if (Storage.get(DEMO_STORAGE_KEY)) return;
    const legacyRaw = Storage.get(LIVE_STORAGE_KEY);
    if (!legacyRaw) return;
    const legacy = sanitizeDashboardWidgetPreferences(legacyRaw);
    const demo = preferencesForScope(legacy, "demo");
    if (!hasAccountEntries(demo)) return;
    const live = preferencesForScope(legacy, "live");
    if (!Storage.set(DEMO_STORAGE_KEY, demo)) return;
    Storage.set(LIVE_STORAGE_KEY, live);
  } catch {
    /* 保留旧 Key，读取时仍会按数据源过滤。 */
  }
}

export function readDashboardWidgetPreferences(
  scope: DashboardPreferenceScope = "live",
): DashboardWidgetPreferences {
  try {
    migrateLegacyDashboardPreferences();
    const direct = Storage.get(storageKey(scope));
    if (direct) {
      return preferencesForScope(
        sanitizeDashboardWidgetPreferences(direct),
        scope,
      );
    }
    if (scope === "demo") {
      return preferencesForScope(
        sanitizeDashboardWidgetPreferences(Storage.get(LIVE_STORAGE_KEY)),
        "demo",
      );
    }
    return preferencesForScope(
      sanitizeDashboardWidgetPreferences(Storage.get(LIVE_STORAGE_KEY)),
      "live",
    );
  } catch {
    return {
      ...DEFAULT_PREFERENCES,
      display: { ...DEFAULT_DISPLAY },
    };
  }
}

export function getDashboardWidgetPreferences(
  scope: DashboardPreferenceScope = "live",
): DashboardWidgetPreferences {
  const cached = inMemoryPreferences[scope];
  if (cached) return cached;
  const preferences = readDashboardWidgetPreferences(scope);
  inMemoryPreferences[scope] = preferences;
  return preferences;
}

export type DashboardWidgetPreferencesWriteResult =
  | { ok: true; value: DashboardWidgetPreferences }
  | { ok: false; value: DashboardWidgetPreferences };

export function setDashboardWidgetPreferences(
  value: DashboardWidgetPreferences,
  scope: DashboardPreferenceScope = "live",
): DashboardWidgetPreferencesWriteResult {
  const next = preferencesForScope(
    sanitizeDashboardWidgetPreferences(value),
    scope,
  );
  try {
    if (!Storage.set(storageKey(scope), next)) {
      return { ok: false, value: next };
    }
    inMemoryPreferences[scope] = next;
    return { ok: true, value: next };
  } catch {
    return { ok: false, value: next };
  }
}

export function setDashboardWidgetAccountVisible(
  accountKey: string,
  visible: boolean,
  scope: DashboardPreferenceScope = "live",
): DashboardWidgetPreferencesWriteResult {
  const preferences = getDashboardWidgetPreferences(scope);
  const hidden = new Set(preferences.hiddenAccountKeys);
  if (visible) hidden.delete(accountKey);
  else hidden.add(accountKey);
  return setDashboardWidgetPreferences(
    { ...preferences, hiddenAccountKeys: [...hidden] },
    scope,
  );
}

export function setDashboardWidgetAccountWindows(
  accountKey: string,
  windowIds: string[],
  scope: DashboardPreferenceScope = "live",
): DashboardWidgetPreferencesWriteResult {
  const preferences = getDashboardWidgetPreferences(scope);
  return setDashboardWidgetPreferences(
    {
      ...preferences,
      windowIdsByAccount: {
        ...preferences.windowIdsByAccount,
        [accountKey]: strings(windowIds).slice(0, 2),
      },
    },
    scope,
  );
}

export function setDashboardWidgetDisplayPreferences(
  patch: Partial<DashboardWidgetDisplayPreferences>,
  scope: DashboardPreferenceScope = "live",
): DashboardWidgetPreferencesWriteResult {
  const preferences = getDashboardWidgetPreferences(scope);
  return setDashboardWidgetPreferences(
    { ...preferences, display: { ...preferences.display, ...patch } },
    scope,
  );
}

export function applyDashboardWidgetPreferences(
  cards: UsageCard[],
  preferences?: DashboardWidgetPreferences,
  scope: DashboardPreferenceScope = "live",
): UsageCard[] {
  const effectivePreferences =
    preferences || getDashboardWidgetPreferences(scope);
  const hidden = new Set(effectivePreferences.hiddenAccountKeys);
  const order = new Map(
    effectivePreferences.accountOrder.map((key, index) => [key, index]),
  );
  return cards
    .filter((card) => !hidden.has(card.key))
    .map((card) => {
      const hasSelection = Object.prototype.hasOwnProperty.call(
        effectivePreferences.windowIdsByAccount,
        card.key,
      );
      const selectedIds =
        effectivePreferences.windowIdsByAccount[card.key] || [];
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
): boolean {
  const scope: DashboardPreferenceScope = isDemoAccountKey(accountKey)
    ? "demo"
    : "live";
  const preferences = getDashboardWidgetPreferences(scope);
  const next: DashboardWidgetPreferences = {
    ...preferences,
    hiddenAccountKeys: preferences.hiddenAccountKeys.filter(
      (key) => key !== accountKey,
    ),
    accountOrder: preferences.accountOrder.filter((key) => key !== accountKey),
    windowIdsByAccount: { ...preferences.windowIdsByAccount },
  };
  delete next.windowIdsByAccount[accountKey];
  return setDashboardWidgetPreferences(next, scope).ok;
}
