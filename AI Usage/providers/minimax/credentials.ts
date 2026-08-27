import type { FocusWindow, WidgetSettings, WidgetStyle } from "./types";

const SETTINGS_KEY = "ai_usage_minimax_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_minimax_profile_settings_v1";

const DEFAULT_SETTINGS: WidgetSettings = {
  focusWindow: "five_hour",
  reloadMinutes: 30,
  widgetStyle: "dual",
};

type ProfileWidgetSettings = Pick<
  WidgetSettings,
  "focusWindow" | "widgetStyle"
>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFocus(value: unknown): value is FocusWindow {
  return value === "five_hour" || value === "weekly";
}
function isWidgetStyle(value: unknown): value is WidgetStyle {
  return value === "dual" || value === "single";
}
function clampReloadMinutes(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(15, Math.min(240, parsed)) : fallback;
}
function sanitizeProfile(value: unknown): ProfileWidgetSettings {
  const object = isObject(value) ? value : {};
  return {
    focusWindow: isFocus(object.focusWindow)
      ? object.focusWindow
      : DEFAULT_SETTINGS.focusWindow,
    widgetStyle: isWidgetStyle(object.widgetStyle)
      ? object.widgetStyle
      : DEFAULT_SETTINGS.widgetStyle,
  };
}

export function getSettings(): WidgetSettings {
  try {
    const value = Storage.get<unknown>(SETTINGS_KEY);
    const profile = sanitizeProfile(value);
    const object = isObject(value) ? value : {};
    return {
      ...profile,
      reloadMinutes: clampReloadMinutes(
        object.reloadMinutes,
        DEFAULT_SETTINGS.reloadMinutes,
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function readProfiles(): Record<string, ProfileWidgetSettings> {
  try {
    const value = Storage.get<unknown>(PROFILE_SETTINGS_KEY);
    if (!isObject(value)) return {};
    const output: Record<string, ProfileWidgetSettings> = {};
    for (const [id, settings] of Object.entries(value))
      output[id] = sanitizeProfile(settings);
    return output;
  } catch {
    return {};
  }
}

export function getEffectiveSettings(
  profileId?: string | null,
): WidgetSettings {
  const settings = getSettings();
  const profile = profileId ? readProfiles()[profileId] : null;
  return profile ? { ...settings, ...profile } : settings;
}

export function setProfileSettings(
  profileId: string,
  patch: Partial<ProfileWidgetSettings>,
): void {
  const profiles = readProfiles();
  profiles[profileId] = sanitizeProfile({ ...profiles[profileId], ...patch });
  Storage.set(PROFILE_SETTINGS_KEY, profiles);
}

export function clearProfileSettings(profileId?: string | null): void {
  if (!profileId) return;
  const profiles = readProfiles();
  if (!(profileId in profiles)) return;
  delete profiles[profileId];
  Storage.set(PROFILE_SETTINGS_KEY, profiles);
}

export function setReloadMinutes(value: number): void {
  Storage.set(SETTINGS_KEY, {
    ...getSettings(),
    reloadMinutes: clampReloadMinutes(value, DEFAULT_SETTINGS.reloadMinutes),
  });
}
