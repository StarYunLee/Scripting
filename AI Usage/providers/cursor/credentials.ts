import { CURSOR_WINDOW_NAMES, type WidgetSettings } from "./types";

const SETTINGS_KEY = "ai_usage_cursor_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_cursor_profile_settings_v1";

const DEFAULT_SETTINGS: WidgetSettings = {
  reloadMinutes: 30,
  hiddenWindows: [],
};

type ProfileWidgetSettings = Pick<WidgetSettings, "hiddenWindows">;
type ProfileSettingsRegistry = {
  profiles: Record<string, ProfileWidgetSettings>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeHiddenWindows(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const known = CURSOR_WINDOW_NAMES as string[];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    if (known.indexOf(item) < 0 || result.indexOf(item) >= 0) continue;
    result.push(item);
  }
  return result;
}

function readProfileRegistry(): ProfileSettingsRegistry {
  try {
    const value = Storage.get<unknown>(PROFILE_SETTINGS_KEY);
    if (!isObject(value) || !isObject(value.profiles)) return { profiles: {} };
    const profiles: Record<string, ProfileWidgetSettings> = {};
    for (const [profileId, settings] of Object.entries(value.profiles)) {
      if (!profileId.trim() || !isObject(settings)) continue;
      profiles[profileId] = {
        hiddenWindows: sanitizeHiddenWindows(settings.hiddenWindows, []),
      };
    }
    return { profiles };
  } catch {
    return { profiles: {} };
  }
}

function writeProfileRegistry(value: ProfileSettingsRegistry): void {
  try {
    Storage.set(PROFILE_SETTINGS_KEY, value);
  } catch {
    /* ignore */
  }
}

export function getSettings(): WidgetSettings {
  try {
    const value = Storage.get<unknown>(SETTINGS_KEY);
    if (!isObject(value)) return { ...DEFAULT_SETTINGS };
    return {
      reloadMinutes:
        typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
          ? Math.min(value.reloadMinutes, 360)
          : DEFAULT_SETTINGS.reloadMinutes,
      hiddenWindows: [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getEffectiveSettings(
  profileId?: string | null,
): WidgetSettings {
  const global = getSettings();
  if (!profileId) return global;
  const profile = readProfileRegistry().profiles[profileId];
  return profile ? { ...global, ...profile } : global;
}

export function setProfileSettings(
  profileId: string,
  patch: Partial<ProfileWidgetSettings>,
): WidgetSettings {
  if (!profileId) return getSettings();
  const current = getEffectiveSettings(profileId);
  const next: ProfileWidgetSettings = {
    hiddenWindows: sanitizeHiddenWindows(
      patch.hiddenWindows,
      current.hiddenWindows,
    ),
  };
  const registry = readProfileRegistry();
  registry.profiles[profileId] = next;
  writeProfileRegistry(registry);
  return { ...getSettings(), ...next };
}

export function clearProfileSettings(profileId: string): WidgetSettings {
  if (!profileId) return getSettings();
  const registry = readProfileRegistry();
  if (profileId in registry.profiles) {
    delete registry.profiles[profileId];
    writeProfileRegistry(registry);
  }
  return getSettings();
}

export function setReloadMinutes(reloadMinutes: number): WidgetSettings {
  const current = getSettings();
  const next: WidgetSettings = {
    ...current,
    reloadMinutes:
      Number.isFinite(reloadMinutes) && reloadMinutes >= 5
        ? Math.min(reloadMinutes, 360)
        : current.reloadMinutes,
  };
  try {
    Storage.set(SETTINGS_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}
