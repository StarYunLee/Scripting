import type { UiTheme } from "../services/prefs";

export type { UiTheme };

/** Content pages are glass-only; settings and editors stay native. */
export const DEFAULT_UI_THEME: UiTheme = "glass";

export function useUiTheme(): UiTheme {
  return "glass";
}

export function useSettingsTheme(): UiTheme {
  return "native";
}
