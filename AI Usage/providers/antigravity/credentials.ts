import {
  clampReloadMinutes,
  createWidgetSettingsStore,
} from "../../services/widget-settings-store";
import type {
  DualQuotaPreset,
  FocusWindow,
  WidgetSettings,
  WidgetStyle,
} from "./types";

const SETTINGS_KEY = "ai_usage_antigravity_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_antigravity_profile_settings_v1";

const DEFAULT_SETTINGS: WidgetSettings = {
  focusWindow: "gemini_weekly",
  reloadMinutes: 30,
  widgetStyle: "dual",
  dualQuotaPreset: "gemini_five_hour_weekly",
};

type ProfileWidgetSettings = Pick<
  WidgetSettings,
  "focusWindow" | "widgetStyle" | "dualQuotaPreset"
>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFocus(value: unknown): value is FocusWindow {
  return value === "gemini_weekly" || value === "third_party_weekly";
}
function isWidgetStyle(value: unknown): value is WidgetStyle {
  return value === "dual" || value === "single";
}
function isDualQuotaPreset(value: unknown): value is DualQuotaPreset {
  return (
    value === "gemini_five_hour_weekly" ||
    value === "third_party_five_hour_weekly" ||
    value === "weekly_both"
  );
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
    dualQuotaPreset: isDualQuotaPreset(object.dualQuotaPreset)
      ? object.dualQuotaPreset
      : fallback.dualQuotaPreset,
  };
}
function hasLegacyDisplayMode(value: unknown): boolean {
  return isObject(value) && "displayMode" in value;
}

const store = createWidgetSettingsStore<
  WidgetSettings,
  ProfileWidgetSettings
>({
  settingsKey: SETTINGS_KEY,
  profileSettingsKey: PROFILE_SETTINGS_KEY,
  defaults: DEFAULT_SETTINGS,
  profileDefaults: DEFAULT_SETTINGS,
  sanitizeProfile: sanitizeDisplaySettings,
  buildSettings(value, defaults) {
    const display = sanitizeDisplaySettings(value, defaults);
    const object = isObject(value) ? value : {};
    return {
      ...display,
      reloadMinutes: clampReloadMinutes(
        object.reloadMinutes,
        defaults.reloadMinutes,
      ),
    };
  },
  merge(settings, profile) {
    return { ...settings, ...profile, reloadMinutes: settings.reloadMinutes };
  },
  migrateSettings(value) {
    return hasLegacyDisplayMode(value);
  },
});

export const getSettings = store.getSettings;
export const getEffectiveSettings = store.getEffectiveSettings;
export const setProfileSettings = store.setProfileSettings;
export const clearProfileSettings = store.clearProfileSettings;
export const setReloadMinutes = store.setReloadMinutes;
