export type CopilotWidgetSettings = Record<string, never>;

const EMPTY_SETTINGS: CopilotWidgetSettings = {};

export function getEffectiveSettings(
  _profileId?: string | null,
): CopilotWidgetSettings {
  return EMPTY_SETTINGS;
}

export function clearProfileSettings(_profileId?: string | null): void {
  /* Copilot settings are not configurable in the two-window template. */
}
