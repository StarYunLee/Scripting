import type { FocusWindow, WidgetSettings } from "./types";

const SETTINGS_KEY = "ai_usage_grok_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_grok_profile_settings_v1";
const DEFAULT_SETTINGS: WidgetSettings = {
  focusWindow: "weekly",
  reloadMinutes: 30,
  provider: "grok",
};

type ProfileWidgetSettings = Pick<WidgetSettings, "focusWindow">;
type ProfileSettingsRegistry = {
  profiles: Record<string, ProfileWidgetSettings>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFocusWindow(value: unknown): value is FocusWindow {
  return value === "weekly" || value === "weekly_build";
}
function sanitizeProfileSettings(
  value: unknown,
  fallback: ProfileWidgetSettings,
): ProfileWidgetSettings {
  const object = isObject(value) ? value : {};
  return {
    focusWindow: isFocusWindow(object.focusWindow)
      ? object.focusWindow
      : fallback.focusWindow,
  };
}

function readProfileRegistry(): ProfileSettingsRegistry {
  try {
    const value = Storage.get<unknown>(PROFILE_SETTINGS_KEY);
    if (value == null) return { profiles: {} };
    // 整合旧的 legacy 清理：同 key 下内容若不是新注册表形状（{ profiles: {...} }），
    // 视为 Deprecated 时代遗留数据删除；形状匹配则保留，避免误删新注册表。
    if (!isObject(value) || !isObject(value.profiles)) {
      Storage.remove(PROFILE_SETTINGS_KEY);
      return { profiles: {} };
    }
    const profiles: Record<string, ProfileWidgetSettings> = {};
    const fallback = sanitizeProfileSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS);
    for (const [profileId, settings] of Object.entries(value.profiles)) {
      if (!profileId.trim() || !isObject(settings)) continue;
      profiles[profileId] = sanitizeProfileSettings(settings, fallback);
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
    const next: WidgetSettings = {
      focusWindow: isFocusWindow(value.focusWindow)
        ? value.focusWindow
        : DEFAULT_SETTINGS.focusWindow,
      reloadMinutes:
        typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
          ? Math.min(value.reloadMinutes, 360)
          : DEFAULT_SETTINGS.reloadMinutes,
      provider: "grok",
    };
    if ("displayMode" in value) Storage.set(SETTINGS_KEY, next);
    return next;
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
  const next = sanitizeProfileSettings({ ...current, ...patch }, current);
  const registry = readProfileRegistry();
  registry.profiles[profileId] = next;
  writeProfileRegistry(registry);
  const global = getSettings();
  return { ...global, ...next, reloadMinutes: global.reloadMinutes };
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
    provider: "grok",
  };
  try {
    Storage.set(SETTINGS_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}
