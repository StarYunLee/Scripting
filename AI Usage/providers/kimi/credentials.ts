import type { FocusWindow, WidgetSettings, WidgetStyle } from "./types";

const SETTINGS_KEY = "ai_usage_kimi_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_kimi_profile_settings_v1";

const DEFAULT_SETTINGS: WidgetSettings = {
  focusWindow: "five_hour",
  reloadMinutes: 30,
  widgetStyle: "dual",
};

type ProfileWidgetSettings = Pick<
  WidgetSettings,
  "focusWindow" | "widgetStyle"
>;
type ProfileSettingsRegistry = {
  profiles: Record<string, ProfileWidgetSettings>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFocus(value: unknown): value is FocusWindow {
  return value === "five_hour" || value === "weekly";
}
function isWidgetStyle(value: unknown): value is WidgetStyle {
  return value === "dual" || value === "single";
}
function sanitizeDisplaySettings(
  value: unknown,
  fallback: ProfileWidgetSettings,
): ProfileWidgetSettings {
  const object = isObject(value) ? value : {};
  return {
    focusWindow: isFocus(object.focusWindow)
      ? object.focusWindow
      : fallback.focusWindow,
    widgetStyle: isWidgetStyle(object.widgetStyle)
      ? object.widgetStyle
      : fallback.widgetStyle,
  };
}

function readProfileRegistry(): ProfileSettingsRegistry {
  try {
    const value = Storage.get<unknown>(PROFILE_SETTINGS_KEY);
    if (!isObject(value) || !isObject(value.profiles)) return { profiles: {} };
    const profiles: Record<string, ProfileWidgetSettings> = {};
    const fallback = sanitizeDisplaySettings(
      DEFAULT_SETTINGS,
      DEFAULT_SETTINGS,
    );
    for (const [profileId, settings] of Object.entries(value.profiles)) {
      if (!profileId.trim() || !isObject(settings)) continue;
      profiles[profileId] = sanitizeDisplaySettings(settings, fallback);
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
    const display = sanitizeDisplaySettings(value, DEFAULT_SETTINGS);
    return {
      ...display,
      reloadMinutes:
        typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
          ? Math.min(value.reloadMinutes, 360)
          : DEFAULT_SETTINGS.reloadMinutes,
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
  return profile
    ? { ...global, ...profile, reloadMinutes: global.reloadMinutes }
    : global;
}

export function setProfileSettings(
  profileId: string,
  patch: Partial<ProfileWidgetSettings>,
): WidgetSettings {
  if (!profileId) return getSettings();
  const current = getEffectiveSettings(profileId);
  const next = sanitizeDisplaySettings({ ...current, ...patch }, current);
  const registry = readProfileRegistry();
  registry.profiles[profileId] = next;
  writeProfileRegistry(registry);
  return {
    ...getSettings(),
    ...next,
    reloadMinutes: getSettings().reloadMinutes,
  };
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
