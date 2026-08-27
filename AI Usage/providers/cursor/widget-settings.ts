export type CursorWidgetSettings = Record<string, never>;

const EMPTY_SETTINGS: CursorWidgetSettings = {};

export function getEffectiveSettings(
  _profileId?: string | null,
): CursorWidgetSettings {
  return EMPTY_SETTINGS;
}

export function clearProfileSettings(_profileId?: string | null): void {
  /* Cursor settings arrive in a later isolated branch. */
}
