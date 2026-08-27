import {
  clampReloadMinutes,
  createWidgetSettingsStore,
} from "../../services/widget-settings-store";
import { CURSOR_WINDOW_NAMES, type WidgetSettings } from "./types";

const SETTINGS_KEY = "ai_usage_cursor_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_cursor_profile_settings_v1";

const DEFAULT_SETTINGS: WidgetSettings = {
  reloadMinutes: 30,
  hiddenWindows: [],
};

type ProfileWidgetSettings = Pick<WidgetSettings, "hiddenWindows">;

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

const store = createWidgetSettingsStore<
  WidgetSettings,
  ProfileWidgetSettings
>({
  settingsKey: SETTINGS_KEY,
  profileSettingsKey: PROFILE_SETTINGS_KEY,
  defaults: DEFAULT_SETTINGS,
  profileDefaults: DEFAULT_SETTINGS,
  sanitizeProfile(value, fallback) {
    const object = isObject(value) ? value : {};
    return {
      hiddenWindows: sanitizeHiddenWindows(
        object.hiddenWindows,
        fallback.hiddenWindows,
      ),
    };
  },
  buildSettings(value, defaults) {
    const object = isObject(value) ? value : {};
    return {
      reloadMinutes: clampReloadMinutes(
        object.reloadMinutes,
        defaults.reloadMinutes,
      ),
      hiddenWindows: [],
    };
  },
  merge(settings, profile) {
    return { ...settings, ...profile };
  },
});

export const getSettings = store.getSettings;
export const getEffectiveSettings = store.getEffectiveSettings;
export const setProfileSettings = store.setProfileSettings;
export const clearProfileSettings = store.clearProfileSettings;
export const setReloadMinutes = store.setReloadMinutes;
