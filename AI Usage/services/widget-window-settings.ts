import type { ProviderId } from "../models";

const STORAGE_KEY = "ai_usage_widget_window_settings_v1";
const SHARED_STORAGE = { shared: true };

type WindowSettings = { hiddenWindowIds: string[] };
type Registry = {
  version: 1;
  accounts: Record<string, WindowSettings>;
};

type StoredRegistry = {
  version?: unknown;
  accounts?: unknown;
};

const EMPTY: WindowSettings = { hiddenWindowIds: [] };
let cache: Registry | null = null;
let storageIdentity: unknown = null;

function bindStorage(): void {
  if (storageIdentity === Storage) return;
  storageIdentity = Storage;
  cache = null;
}

function accountKey(provider: ProviderId, profileId: string): string {
  return `${provider}:${profileId}`;
}

function isObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectOf(value: unknown): Record<string, unknown> {
  return isObject(value) ? (value as Record<string, unknown>) : {};
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id && !result.includes(id)) result.push(id);
  }
  return result;
}

function sanitizeSettings(value: unknown): WindowSettings {
  const object = objectOf(value);
  return { hiddenWindowIds: cleanIds(object.hiddenWindowIds) };
}

function read(): Registry {
  bindStorage();
  if (cache) return cache;
  try {
    const stored = Storage.get<unknown>(STORAGE_KEY, SHARED_STORAGE);
    if (!isObject(stored)) {
      cache = { version: 1, accounts: {} };
      return cache;
    }
    const registry = stored as StoredRegistry;
    const version = typeof registry.version === "number" ? registry.version : 1;
    if (version > 1) throw new Error("小组件窗口设置版本较新，请升级 AI Usage");
    const rawAccounts = objectOf(registry.accounts);
    const accounts: Record<string, WindowSettings> = {};
    for (const [key, value] of Object.entries(rawAccounts)) {
      if (!key.trim() || !isObject(value)) continue;
      accounts[key] = sanitizeSettings(value);
    }
    cache = { version: 1, accounts };
    return cache;
  } catch (error) {
    if (error instanceof Error && error.message.includes("版本较新")) throw error;
    cache = { version: 1, accounts: {} };
    return cache;
  }
}

function write(registry: Registry): boolean {
  try {
    if (Storage.set(STORAGE_KEY, registry, SHARED_STORAGE)) {
      cache = registry;
      return true;
    }
  } catch {
    /* fall through */
  }
  cache = null;
  return false;
}

function copy(settings: WindowSettings): WindowSettings {
  return { hiddenWindowIds: [...settings.hiddenWindowIds] };
}

export function hasWidgetWindowSettings(
  provider: ProviderId,
  profileId?: string | null,
): boolean {
  if (!profileId) return false;
  return accountKey(provider, profileId) in read().accounts;
}

export function getWidgetWindowSettings(
  provider: ProviderId,
  profileId?: string | null,
): WindowSettings {
  if (!profileId) return copy(EMPTY);
  return copy(read().accounts[accountKey(provider, profileId)] || EMPTY);
}

export function setWidgetWindowSettings(
  provider: ProviderId,
  profileId: string,
  patch: Partial<WindowSettings>,
): boolean {
  if (!profileId) return false;
  const registry = read();
  const key = accountKey(provider, profileId);
  const current = registry.accounts[key] || EMPTY;
  const next = sanitizeSettings({ ...current, ...patch });
  return write({
    version: 1,
    accounts: { ...registry.accounts, [key]: next },
  });
}

export function clearWidgetWindowSettings(
  provider: ProviderId,
  profileId?: string | null,
): void {
  if (!profileId) return;
  const registry = read();
  const key = accountKey(provider, profileId);
  if (!(key in registry.accounts)) return;
  const accounts = { ...registry.accounts };
  delete accounts[key];
  write({ version: 1, accounts });
}
