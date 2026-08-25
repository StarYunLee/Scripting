import type { WidgetSettings } from "./types";

const SETTINGS_KEY = "ai_usage_grok_settings_v1";
const PROFILE_SETTINGS_KEY = "ai_usage_grok_profile_settings_v1";
const DEFAULT_SETTINGS: WidgetSettings = {
  reloadMinutes: 30,
  provider: "grok",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function removeLegacyProfileSettings(): void {
  try {
    if (Storage.get<unknown>(PROFILE_SETTINGS_KEY) != null) {
      Storage.remove(PROFILE_SETTINGS_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getSettings(): WidgetSettings {
  removeLegacyProfileSettings();
  try {
    const value = Storage.get<unknown>(SETTINGS_KEY);
    if (!isObject(value)) return { ...DEFAULT_SETTINGS };
    const next: WidgetSettings = {
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
  _profileId?: string | null,
): WidgetSettings {
  return getSettings();
}

export function clearProfileSettings(_profileId: string): WidgetSettings {
  removeLegacyProfileSettings();
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
