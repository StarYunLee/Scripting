export type WorkbuddyWidgetSettings = Record<string, never>;

const EMPTY_SETTINGS: WorkbuddyWidgetSettings = {};

export function getEffectiveSettings(
  _profileId?: string | null,
): WorkbuddyWidgetSettings {
  return EMPTY_SETTINGS;
}

export function clearProfileSettings(_profileId?: string | null): void {
  /* WorkBuddy uses a fixed widget layout; there is no per-profile window choice. */
}
