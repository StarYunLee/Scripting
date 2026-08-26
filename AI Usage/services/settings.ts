import {
  getSettings as getCodexSettings,
  setReloadMinutes as setCodexReloadMinutes,
} from "../providers/codex/credentials";
import {
  getSettings as getGrokSettings,
  setReloadMinutes as setGrokReloadMinutes,
} from "../providers/grok/credentials";
import {
  getSettings as getClaudeSettings,
  setReloadMinutes as setClaudeReloadMinutes,
} from "../providers/claude/credentials";
import {
  getSettings as getAntigravitySettings,
  setReloadMinutes as setAntigravityReloadMinutes,
} from "../providers/antigravity/credentials";
import {
  getSettings as getCursorSettings,
  setReloadMinutes as setCursorReloadMinutes,
} from "../providers/cursor/credentials";
import {
  getSettings as getKimiSettings,
  setReloadMinutes as setKimiReloadMinutes,
} from "../providers/kimi/credentials";
import {
  getSettings as getCopilotSettings,
  setReloadMinutes as setCopilotReloadMinutes,
} from "../providers/copilot/credentials";

const DISPLAY_KEY = "ai_usage_display_settings_v1";

export type BackgroundThemeId =
  "system_default" | "cool_blue" | "warm_paper" | "mist_haze";

export type AppDisplaySettings = {
  reloadMinutes: number;
  backgroundTheme: BackgroundThemeId;
};

export const BACKGROUND_THEMES: Array<{
  id: BackgroundThemeId;
  title: string;
}> = [
  {
    id: "system_default",
    title: "系统",
  },
  {
    id: "cool_blue",
    title: "冷蓝",
  },
  {
    id: "warm_paper",
    title: "暖纸",
  },
  {
    id: "mist_haze",
    title: "雾霭",
  },
];

const DEFAULT_SETTINGS: AppDisplaySettings = {
  reloadMinutes: 30,
  backgroundTheme: "warm_paper",
};

function clampMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 5) return DEFAULT_SETTINGS.reloadMinutes;
  return Math.min(360, n);
}

function normalizeTheme(value: unknown): BackgroundThemeId {
  if (value === "system_default" || value === "cool_blue") return value;
  if (value === "mist_haze") return "mist_haze";
  return "warm_paper";
}

let legacyWidgetSettingsMigrated = false;

function migrateLegacyWidgetSettings(): void {
  if (legacyWidgetSettingsMigrated) return;
  legacyWidgetSettingsMigrated = true;
  getCodexSettings();
  getGrokSettings();
  getClaudeSettings();
  getAntigravitySettings();
  getCursorSettings();
  getKimiSettings();
  getCopilotSettings();
}

export function getAppDisplaySettings(): AppDisplaySettings {
  migrateLegacyWidgetSettings();
  try {
    const value = Storage.get<Partial<AppDisplaySettings>>(DISPLAY_KEY);
    if (!value || typeof value !== "object") {
      const fallback =
        getCodexSettings().reloadMinutes ||
        getGrokSettings().reloadMinutes ||
        getClaudeSettings().reloadMinutes ||
        getAntigravitySettings().reloadMinutes ||
        getCursorSettings().reloadMinutes ||
        getKimiSettings().reloadMinutes ||
        getCopilotSettings().reloadMinutes;
      return { ...DEFAULT_SETTINGS, reloadMinutes: clampMinutes(fallback) };
    }
    return {
      reloadMinutes: clampMinutes(value.reloadMinutes),
      backgroundTheme: normalizeTheme(value.backgroundTheme),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setAppReloadMinutes(reloadMinutes: number): AppDisplaySettings {
  const next = {
    ...getAppDisplaySettings(),
    reloadMinutes: clampMinutes(reloadMinutes),
  };
  try {
    Storage.set(DISPLAY_KEY, next);
  } catch {
    /* ignore */
  }
  setCodexReloadMinutes(next.reloadMinutes);
  setGrokReloadMinutes(next.reloadMinutes);
  setClaudeReloadMinutes(next.reloadMinutes);
  setAntigravityReloadMinutes(next.reloadMinutes);
  setCursorReloadMinutes(next.reloadMinutes);
  setKimiReloadMinutes(next.reloadMinutes);
  setCopilotReloadMinutes(next.reloadMinutes);
  return next;
}

export function setAppBackgroundTheme(
  backgroundTheme: BackgroundThemeId,
): AppDisplaySettings {
  const next = {
    ...getAppDisplaySettings(),
    backgroundTheme: normalizeTheme(backgroundTheme),
  };
  try {
    Storage.set(DISPLAY_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}
