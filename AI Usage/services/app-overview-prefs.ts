import type { ProviderId, UsageCard, UsageWindowView } from "../models";

const STORAGE_KEY = "ai_usage_app_overview_preferences_v1";

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

function readPreferences(): OverviewPreferences {
  try {
    const stored = Storage.get<StoredPreferences>(STORAGE_KEY);
    if (!stored || typeof stored !== "object") {
      return { hiddenAccounts: [], hiddenWindows: {} };
    }
    const hiddenWindows: Record<string, string[]> = {};
    if (stored.hiddenWindows && typeof stored.hiddenWindows === "object") {
      for (const [key, value] of Object.entries(stored.hiddenWindows)) {
        const ids = uniqueStrings(value);
        if (ids.length > 0) hiddenWindows[key] = ids;
      }
    }
    return {
      hiddenAccounts: uniqueStrings(stored.hiddenAccounts),
      hiddenWindows,
    };
  } catch {
    return { hiddenAccounts: [], hiddenWindows: {} };
  }
}

function writePreferences(value: OverviewPreferences): void {
  try {
    Storage.set(STORAGE_KEY, value);
  } catch {
    /* Keep the current session usable if persistence is unavailable. */
  }
}

export function isAccountShownInOverview(
  provider: ProviderId,
  accountId: string,
): boolean {
  return !readPreferences().hiddenAccounts.includes(
    accountKey(provider, accountId),
  );
}

export function setAccountShownInOverview(
  provider: ProviderId,
  accountId: string,
  shown: boolean,
): void {
  const preferences = readPreferences();
  const key = accountKey(provider, accountId);
  preferences.hiddenAccounts = shown
    ? preferences.hiddenAccounts.filter((item) => item !== key)
    : uniqueStrings([...preferences.hiddenAccounts, key]);
  writePreferences(preferences);
}

export function visibleOverviewWindows(
  provider: ProviderId,
  accountId: string,
  windows: UsageWindowView[],
): UsageWindowView[] {
  const hidden = new Set(
    readPreferences().hiddenWindows[accountKey(provider, accountId)] || [],
  );
  return windows.filter((window) => !hidden.has(window.id));
}

export function isWindowShownInOverview(
  provider: ProviderId,
  accountId: string,
  windowId: string,
): boolean {
  const hidden =
    readPreferences().hiddenWindows[accountKey(provider, accountId)];
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
  const preferences = readPreferences();
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
  writePreferences(preferences);
  return true;
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
): void {
  const key = accountKey(provider, accountId);
  const preferences = readPreferences();
  preferences.hiddenAccounts = preferences.hiddenAccounts.filter(
    (item) => item !== key,
  );
  delete preferences.hiddenWindows[key];
  writePreferences(preferences);
}
