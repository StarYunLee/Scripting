import type { WidgetSettings } from "./types";

const SETTINGS_KEY = "ai_usage_copilot_settings_v1";
const DEFAULT_SETTINGS: WidgetSettings = {
  reloadMinutes: 30,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    };
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
  return getSettings();
}

export function setReloadMinutes(reloadMinutes: number): WidgetSettings {
  const current = getSettings();
  const next: WidgetSettings = {
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
