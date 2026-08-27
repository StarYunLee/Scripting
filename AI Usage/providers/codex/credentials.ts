import {
  clampReloadMinutes,
  createWidgetSettingsStore,
} from "../../services/widget-settings-store";
import type {
  FocusWindow,
  MediumWidgetLayout,
  WidgetLayout,
  WidgetSettings,
} from "./types";

const SETTINGS_KEY = "ai_usage_codex_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_codex_profile_settings_v1";

const DEFAULT_SETTINGS: WidgetSettings = {
  focusWindow: "weekly",
  reloadMinutes: 30,
  widgetLayout: "detail",
};

/** Medium 单额度详情布局基线。 */
export const MEDIUM_LAYOUT: MediumWidgetLayout = {
  left: 20,
  right: 20,
  topY: 10,
  chipFont: 12,
  chipHorizontal: 10,
  chipVertical: 6,
  titleY: 35,
  titleFont: 17,
  mainY: 56,
  mainFont: 40,
  suffixFont: 12,
  progressY: 110,
  progressHeight: 7,
  footerY: 122,
  footerIcon: 10,
  footerLabelFont: 10,
  footerValueFont: 12,
  planY: 9,
  watermarkSize: 135,
  watermarkRight: -8,
  watermarkBottom: -12,
};

type ProfileWidgetSettings = Pick<
  WidgetSettings,
  "focusWindow" | "widgetLayout"
>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFocus(value: unknown): value is FocusWindow {
  return value === "five_hour" || value === "weekly" || value === "monthly";
}
function isWidgetLayout(value: unknown): value is WidgetLayout {
  return value === "detail" || value === "overview";
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
    widgetLayout: isWidgetLayout(object.widgetLayout)
      ? object.widgetLayout
      : fallback.widgetLayout,
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
