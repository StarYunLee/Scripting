import type { WidgetSettings } from "./types";

const DEFAULT_SETTINGS: WidgetSettings = {};

export function getEffectiveSettings(
  _profileId?: string | null,
): WidgetSettings {
  return DEFAULT_SETTINGS;
}

export function clearProfileSettings(_profileId?: string | null): void {
  // MiniMax v1 uses the fixed v1.1.2 dual-quota widget geometry.
}
