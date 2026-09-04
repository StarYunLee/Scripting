import type { ProviderId, UsageCard, UsageWindowView } from "../models";

const LIVE_STORAGE_KEY = "ai_usage_app_overview_preferences_v1";
const DEMO_STORAGE_KEY = "ai_usage_demo_app_overview_preferences_v1";

function storageKey(accountId: string): string {
  return accountId.startsWith("demo_") ? DEMO_STORAGE_KEY : LIVE_STORAGE_KEY;
}

type StoredPreferences = {
  hiddenAccounts?: unknown;
  hiddenWindows?: unknown;
};

type OverviewPreferences = {
  hiddenAccounts: string[];
  hiddenWindows: Record<string, string[]>;
};

function accountKey(provider: ProviderId, accountId: string): string {
  return `${provider}:${accountId}`;
}

function belongsToDemo(key: string): boolean {
  const separator = key.indexOf(":");
  return separator >= 0 && key.slice(separator + 1).startsWith("demo_");
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    ),
  ];
}

function migrateLegacyOverviewPreferences(): void {
  try {
    if (Storage.get(DEMO_STORAGE_KEY)) return;
    const legacy = Storage.get<StoredPreferences>(LIVE_STORAGE_KEY);
    if (!legacy || typeof legacy !== "object") return;
    const hiddenAccounts = uniqueStrings(legacy.hiddenAccounts);
    const rawHiddenWindows =
      legacy.hiddenWindows && typeof legacy.hiddenWindows === "object"
        ? (legacy.hiddenWindows as Record<string, unknown>)
        : {};
    const demo: OverviewPreferences = {
      hiddenAccounts: hiddenAccounts.filter(belongsToDemo),
      hiddenWindows: Object.fromEntries(
        Object.entries(rawHiddenWindows)
          .filter(([key]) => belongsToDemo(key))
          .map(([key, value]) => [key, uniqueStrings(value)]),
      ),
    };
    if (
      !demo.hiddenAccounts.length &&
      !Object.keys(demo.hiddenWindows).length
    ) {
      return;
    }
    const live: OverviewPreferences = {
      hiddenAccounts: hiddenAccounts.filter((key) => !belongsToDemo(key)),
      hiddenWindows: Object.fromEntries(
        Object.entries(rawHiddenWindows)
          .filter(([key]) => !belongsToDemo(key))
          .map(([key, value]) => [key, uniqueStrings(value)]),
      ),
    };
    if (!Storage.set(DEMO_STORAGE_KEY, demo)) return;
    Storage.set(LIVE_STORAGE_KEY, live);
  } catch {
    /* 保留旧 Key，读取时仍按账号类型过滤。 */
  }
}

function readPreferences(accountId: string): OverviewPreferences {
  try {
    migrateLegacyOverviewPreferences();
    const key = storageKey(accountId);
    const direct = Storage.get<StoredPreferences>(key);
    const stored =
      direct ||
      (accountId.startsWith("demo_")
        ? Storage.get<StoredPreferences>(LIVE_STORAGE_KEY)
        : null);
    if (!stored || typeof stored !== "object") {
      return { hiddenAccounts: [], hiddenWindows: {} };
    }
    const demoScope = accountId.startsWith("demo_");
    const hiddenWindows: Record<string, string[]> = {};
    if (stored.hiddenWindows && typeof stored.hiddenWindows === "object") {
      for (const [key, value] of Object.entries(stored.hiddenWindows)) {
        if (belongsToDemo(key) !== demoScope) continue;
        const ids = uniqueStrings(value);
        if (ids.length > 0) hiddenWindows[key] = ids;
      }
    }
    const result = {
      hiddenAccounts: uniqueStrings(stored.hiddenAccounts).filter(
        (key) => belongsToDemo(key) === demoScope,
      ),
      hiddenWindows,
    };
    if (!direct && accountId.startsWith("demo_")) {
      Storage.set(DEMO_STORAGE_KEY, result);
    }
    return result;
  } catch {
    return { hiddenAccounts: [], hiddenWindows: {} };
  }
}

function writePreferences(
  accountId: string,
  value: OverviewPreferences,
): boolean {
  try {
    return Storage.set(storageKey(accountId), value);
  } catch {
    return false;
  }
}

export function isAccountShownInOverview(
  provider: ProviderId,
  accountId: string,
): boolean {
  return !readPreferences(accountId).hiddenAccounts.includes(
    accountKey(provider, accountId),
  );
}

export function setAccountShownInOverview(
  provider: ProviderId,
  accountId: string,
  shown: boolean,
): boolean {
  const preferences = readPreferences(accountId);
  const key = accountKey(provider, accountId);
  preferences.hiddenAccounts = shown
    ? preferences.hiddenAccounts.filter((item) => item !== key)
    : uniqueStrings([...preferences.hiddenAccounts, key]);
  return writePreferences(accountId, preferences);
}

export function visibleOverviewWindows(
  provider: ProviderId,
  accountId: string,
  windows: UsageWindowView[],
): UsageWindowView[] {
  const hidden = new Set(
    readPreferences(accountId).hiddenWindows[accountKey(provider, accountId)] ||
      [],
  );
  return windows.filter((window) => !hidden.has(window.id));
}

export function isWindowShownInOverview(
  provider: ProviderId,
  accountId: string,
  windowId: string,
): boolean {
  const hidden =
    readPreferences(accountId).hiddenWindows[accountKey(provider, accountId)];
  return !hidden?.includes(windowId);
}

export function setWindowShownInOverview(
  provider: ProviderId,
  accountId: string,
  windows: UsageWindowView[],
  windowId: string,
  shown: boolean,
): boolean {
  const key = accountKey(provider, accountId);
  const preferences = readPreferences(accountId);
  const hidden = new Set(preferences.hiddenWindows[key] || []);
  if (shown) {
    hidden.delete(windowId);
  } else {
    const visibleCount = windows.filter(
      (window) => !hidden.has(window.id),
    ).length;
    if (visibleCount <= 1 && !hidden.has(windowId)) return false;
    hidden.add(windowId);
  }
  if (hidden.size > 0) preferences.hiddenWindows[key] = [...hidden];
  else delete preferences.hiddenWindows[key];
  return writePreferences(accountId, preferences);
}

export function applyOverviewPreferences(cards: UsageCard[]): UsageCard[] {
  return cards
    .filter((card) => isAccountShownInOverview(card.provider, card.accountId))
    .map((card) => ({
      ...card,
      windows: visibleOverviewWindows(
        card.provider,
        card.accountId,
        card.windows,
      ),
    }));
}

export function clearAccountOverviewPreferences(
  provider: ProviderId,
  accountId: string,
): boolean {
  const key = accountKey(provider, accountId);
  const preferences = readPreferences(accountId);
  preferences.hiddenAccounts = preferences.hiddenAccounts.filter(
    (item) => item !== key,
  );
  delete preferences.hiddenWindows[key];
  return writePreferences(accountId, preferences);
}
