export type ZaiWidgetSettings = Record<string, never>;
const EMPTY_SETTINGS: ZaiWidgetSettings = {};
export function getEffectiveSettings(
  _profileId?: string | null,
): ZaiWidgetSettings {
  return EMPTY_SETTINGS;
}
export function clearProfileSettings(_profileId?: string | null): void {
  /* Z.ai window selection belongs in a later isolated branch. */
}
