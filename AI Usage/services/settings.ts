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

const DISPLAY_KEY = "ai_usage_display_settings_v1";

export type BackgroundThemeId =
  "system_default" | "cool_blue" | "warm_paper" | "mist_haze";

export type AppDisplaySettings = {
  /** 0 = 手动（App 启动不自动联网；小组件也不自动拉新） */
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

/** 设置页刷新间隔档位：0 = 手动 */
export const RELOAD_MINUTE_OPTIONS = [0, 5, 15, 30, 60] as const;

export const RELOAD_MINUTE_LABELS: Record<number, string> = {
  0: "手动",
  5: "5 分钟",
  15: "15 分钟",
  30: "30 分钟",
  60: "1 小时",
};

const DEFAULT_SETTINGS: AppDisplaySettings = {
  // 贴近原先「打开几乎会刷一次」的体验，同时允许短时复用缓存秒开。
  reloadMinutes: 5,
  backgroundTheme: "system_default",
};

/** 把任意遗留值吸附到最近档位，保证 Picker 有选中项。 */
export function snapReloadMinutes(value: number): number {
  let nearest: number = RELOAD_MINUTE_OPTIONS[0];
  for (const option of RELOAD_MINUTE_OPTIONS) {
    if (Math.abs(option - value) < Math.abs(nearest - value)) nearest = option;
  }
  return nearest;
}

function clampMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.reloadMinutes;
  if (n === 0) return 0;
  if (n < 5) return DEFAULT_SETTINGS.reloadMinutes;
  return snapReloadMinutes(Math.min(360, n));
}

function normalizeTheme(value: unknown): BackgroundThemeId {
  if (
    value === "system_default" ||
    value === "cool_blue" ||
    value === "warm_paper" ||
    value === "mist_haze"
  ) {
    return value;
  }
  return DEFAULT_SETTINGS.backgroundTheme;
}

let legacyWidgetSettingsMigrated = false;

function migrateLegacyWidgetSettings(): void {
  if (legacyWidgetSettingsMigrated) return;
  legacyWidgetSettingsMigrated = true;
  getCodexSettings();
  getGrokSettings();
  getClaudeSettings();
  getAntigravitySettings();
}

export type StorageWriteResult<T> =
  { ok: true; value: T } | { ok: false; value: T };

export function getAppDisplaySettings(): AppDisplaySettings {
  migrateLegacyWidgetSettings();
  try {
    const value = Storage.get<Partial<AppDisplaySettings>>(DISPLAY_KEY);
    if (!value || typeof value !== "object") {
      const fallback =
        getCodexSettings().reloadMinutes ||
        getGrokSettings().reloadMinutes ||
        getClaudeSettings().reloadMinutes ||
        getAntigravitySettings().reloadMinutes;
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

export function setAppReloadMinutes(
  reloadMinutes: number,
): StorageWriteResult<AppDisplaySettings> {
  const next = {
    ...getAppDisplaySettings(),
    reloadMinutes: clampMinutes(reloadMinutes),
  };
  try {
    if (!Storage.set(DISPLAY_KEY, next)) return { ok: false, value: next };
  } catch {
    return { ok: false, value: next };
  }
  // provider 凭证层不接受 0（手动）；仅在有效自动间隔时向下同步。
  if (next.reloadMinutes > 0) {
    setCodexReloadMinutes(next.reloadMinutes);
    setGrokReloadMinutes(next.reloadMinutes);
    setClaudeReloadMinutes(next.reloadMinutes);
    setAntigravityReloadMinutes(next.reloadMinutes);
  }
  return { ok: true, value: next };
}

export function setAppBackgroundTheme(
  backgroundTheme: BackgroundThemeId,
): StorageWriteResult<AppDisplaySettings> {
  const next = {
    ...getAppDisplaySettings(),
    backgroundTheme: normalizeTheme(backgroundTheme),
  };
  try {
    if (!Storage.set(DISPLAY_KEY, next)) return { ok: false, value: next };
    return { ok: true, value: next };
  } catch {
    return { ok: false, value: next };
  }
}
