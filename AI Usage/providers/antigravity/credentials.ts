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
type ProfileSettingsRegistry = {
  profiles: Record<string, ProfileWidgetSettings>;
};

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

function readProfileRegistry(): ProfileSettingsRegistry {
  try {
    const value = Storage.get<unknown>(PROFILE_SETTINGS_KEY);
    if (!isObject(value) || !isObject(value.profiles)) return { profiles: {} };
    const profiles: Record<string, ProfileWidgetSettings> = {};
    let migrated = false;
    for (const [profileId, settings] of Object.entries(value.profiles)) {
      if (!profileId.trim() || !isObject(settings)) continue;
      profiles[profileId] = sanitizeDisplaySettings(settings, DEFAULT_SETTINGS);
      if (hasLegacyDisplayMode(settings)) migrated = true;
    }
    const registry = { profiles };
    if (migrated) writeProfileRegistry(registry);
    return registry;
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
  readProfileRegistry();
  try {
    const value = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY);
    if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
    const display = sanitizeDisplaySettings(value, DEFAULT_SETTINGS);
    const next = {
      ...display,
      reloadMinutes:
        typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
          ? Math.min(value.reloadMinutes, 360)
          : DEFAULT_SETTINGS.reloadMinutes,
    };
    if (hasLegacyDisplayMode(value)) Storage.set(SETTINGS_KEY, next);
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
  const next = sanitizeDisplaySettings({ ...current, ...patch }, current);
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
  const next = {
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
