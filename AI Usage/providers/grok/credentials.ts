import {
  clampReloadMinutes,
  createWidgetSettingsStore,
} from "../../services/widget-settings-store";
import type { FocusWindow, WidgetSettings } from "./types";

const SETTINGS_KEY = "ai_usage_grok_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_grok_profile_settings_v1";
const DEFAULT_SETTINGS: WidgetSettings = {
  focusWindow: "weekly",
  reloadMinutes: 30,
  provider: "grok",
};

type ProfileWidgetSettings = Pick<WidgetSettings, "focusWindow">;

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

const store = createWidgetSettingsStore<
  WidgetSettings,
  ProfileWidgetSettings
>({
  settingsKey: SETTINGS_KEY,
  profileSettingsKey: PROFILE_SETTINGS_KEY,
  defaults: DEFAULT_SETTINGS,
  profileDefaults: DEFAULT_SETTINGS,
  sanitizeProfile: sanitizeProfileSettings,
  buildSettings(value, defaults) {
    const object = isObject(value) ? value : {};
    return {
      focusWindow: isFocusWindow(object.focusWindow)
        ? object.focusWindow
        : defaults.focusWindow,
      reloadMinutes: clampReloadMinutes(
        object.reloadMinutes,
        defaults.reloadMinutes,
      ),
      provider: "grok",
    };
  },
  merge(settings, profile) {
    return { ...settings, ...profile, reloadMinutes: settings.reloadMinutes };
  },
  migrateSettings(value) {
    return isObject(value) && "displayMode" in value;
  },
  invalidProfileRegistry: "remove",
});

export const getSettings = store.getSettings;
export const getEffectiveSettings = store.getEffectiveSettings;
export const setProfileSettings = store.setProfileSettings;
export const clearProfileSettings = store.clearProfileSettings;
export const setReloadMinutes = store.setReloadMinutes;
