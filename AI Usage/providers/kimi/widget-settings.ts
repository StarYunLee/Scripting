export type KimiWidgetSettings = Record<string, never>;

const EMPTY_SETTINGS: KimiWidgetSettings = {};

export function getEffectiveSettings(
  _profileId?: string | null,
): KimiWidgetSettings {
  return EMPTY_SETTINGS;
}

export function clearProfileSettings(_profileId?: string | null): void {
  /* Kimi settings are not configurable in the two-window template. */
}
