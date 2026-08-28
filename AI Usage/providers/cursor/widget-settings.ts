import { CURSOR_WINDOW_NAMES } from "./types";

const PROFILE_SETTINGS_KEY = "ai_usage_cursor_profile_settings_v1";
const SHARED_STORAGE = { shared: true };

export type CursorWidgetSettings = {
  hiddenWindows: string[];
};

type ProfileRegistry = {
  profiles: Record<string, CursorWidgetSettings>;
};

const DEFAULT_SETTINGS: CursorWidgetSettings = { hiddenWindows: [] };
let cache: ProfileRegistry | null = null;
let storageIdentity: unknown = null;

function bindRuntimeStorage(): void {
  if (storageIdentity === Storage) return;
  storageIdentity = Storage;
  cache = null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeHiddenWindows(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const known = CURSOR_WINDOW_NAMES as string[];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    if (!known.includes(item) || result.includes(item)) continue;
    result.push(item);
  }
  return result;
}

function sanitize(value: unknown): CursorWidgetSettings {
  const object = objectValue(value) || {};
  return { hiddenWindows: sanitizeHiddenWindows(object.hiddenWindows) };
}

function sameSettings(left: CursorWidgetSettings, right: unknown): boolean {
  const object = objectValue(right);
  if (!object) return false;
  const hiddenWindows = object.hiddenWindows;
  if (!Array.isArray(hiddenWindows)) return false;
  return (
    left.hiddenWindows.length === hiddenWindows.length &&
    left.hiddenWindows.every((item, index) => item === hiddenWindows[index])
  );
}

function write(registry: ProfileRegistry): ProfileRegistry {
  try {
    if (Storage.set(PROFILE_SETTINGS_KEY, registry, SHARED_STORAGE)) {
      cache = registry;
      return cache;
    }
  } catch {
    /* fall through to the failure path below */
  }
  // 写失败时不能保留刚被拒绝的缓存，否则后续读取会永久返回陈旧状态。
  cache = null;
  return registry;
}

function read(): ProfileRegistry {
  bindRuntimeStorage();
  if (cache) return cache;
  try {
    const stored = objectValue(
      Storage.get<unknown>(PROFILE_SETTINGS_KEY, SHARED_STORAGE),
    );
    const storedProfiles = objectValue(stored?.profiles);
    if (!stored || !storedProfiles) {
      cache = { profiles: {} };
      return cache;
    }
    const profiles: Record<string, CursorWidgetSettings> = {};
    let changed = false;
    for (const [profileId, value] of Object.entries(storedProfiles)) {
      if (!profileId.trim() || !objectValue(value)) {
        changed = true;
        continue;
      }
      const settings = sanitize(value);
      profiles[profileId] = settings;
      if (!sameSettings(settings, value)) changed = true;
    }
    cache = { profiles };
    if (changed) write(cache);
    return cache;
  } catch {
    cache = { profiles: {} };
    return cache;
  }
}

export function getEffectiveSettings(
  profileId?: string | null,
): CursorWidgetSettings {
  if (!profileId) return { ...DEFAULT_SETTINGS, hiddenWindows: [] };
  const settings = read().profiles[profileId];
  return settings
    ? { hiddenWindows: [...settings.hiddenWindows] }
    : { ...DEFAULT_SETTINGS, hiddenWindows: [] };
}

export function setProfileSettings(
  profileId: string,
  patch: Partial<CursorWidgetSettings>,
): CursorWidgetSettings {
  if (!profileId) return getEffectiveSettings();
  const registry = read();
  const current = registry.profiles[profileId] || DEFAULT_SETTINGS;
  const next = sanitize({ ...current, ...patch });
  const persisted = write({
    profiles: { ...registry.profiles, [profileId]: next },
  });
  return persisted.profiles[profileId] || getEffectiveSettings(profileId);
}

export function clearProfileSettings(profileId?: string | null): void {
  if (!profileId) return;
  const registry = read();
  if (!(profileId in registry.profiles)) return;
  const profiles = { ...registry.profiles };
  delete profiles[profileId];
  write({ profiles });
}
