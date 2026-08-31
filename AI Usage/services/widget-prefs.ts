import type { ProviderId, UsageWindowView } from "../models";

const STORAGE_KEY = "ai_usage_widget_window_preferences_v1";

type StoredWidgetPreferences = {
  // Key 格式: `${provider}:${accountId}` -> 选中的 windowId 列表（有序，1~4 个）
  selectedWindows?: Record<string, string[]>;
};

function accountKey(provider: ProviderId, accountId: string): string {
  return `${provider}:${accountId}`;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    ),
  ];
}

function readPreferences(): StoredWidgetPreferences {
  try {
    const stored = Storage.get<StoredWidgetPreferences>(STORAGE_KEY);
    if (!stored || typeof stored !== "object") {
      return { selectedWindows: {} };
    }
    const selectedWindows: Record<string, string[]> = {};
    if (stored.selectedWindows && typeof stored.selectedWindows === "object") {
      for (const [key, value] of Object.entries(stored.selectedWindows)) {
        const ids = uniqueStrings(value);
        if (ids.length > 0) selectedWindows[key] = ids;
      }
    }
    return { selectedWindows };
  } catch {
    return { selectedWindows: {} };
  }
}

function writePreferences(value: StoredWidgetPreferences): boolean {
  try {
    return Storage.set(STORAGE_KEY, value);
  } catch {
    return false;
  }
}

/** 获取小组件生效的窗口列表（1~4 项，带自动降级兜底） */
export function getEffectiveWidgetWindows(
  provider: ProviderId,
  accountId: string,
  allWindows: UsageWindowView[],
): UsageWindowView[] {
  if (!allWindows || allWindows.length === 0) return [];
  const key = accountKey(provider, accountId);
  const selectedIds = readPreferences().selectedWindows?.[key];

  if (selectedIds && selectedIds.length > 0) {
    const selected = new Set(selectedIds);
    const matched = allWindows.filter((window) => selected.has(window.id));
    if (matched.length > 0) {
      return matched.slice(0, 4);
    }
  }

  // 默认兜底：取前 2 个（或仅有的 1 个）
  return allWindows.slice(0, Math.min(2, allWindows.length));
}

/** 检查某个窗口是否已被小组件选中 */
export function isWindowSelectedForWidget(
  provider: ProviderId,
  accountId: string,
  allWindows: UsageWindowView[],
  windowId: string,
): boolean {
  const current = getEffectiveWidgetWindows(provider, accountId, allWindows);
  return current.some((w) => w.id === windowId);
}

/**
 * 切换小组件窗口的选中状态（受 1~4 项约束限制）
 * @returns 切换成功返回 true，违反 1~4 项约束返回 false
 */
export function toggleWidgetWindowSelection(
  provider: ProviderId,
  accountId: string,
  allWindows: UsageWindowView[],
  windowId: string,
  enabled: boolean,
): boolean {
  const key = accountKey(provider, accountId);
  const current = getEffectiveWidgetWindows(provider, accountId, allWindows);
  const currentIds = current.map((w) => w.id);

  if (enabled) {
    // 开启：上限最多 4 项
    if (currentIds.includes(windowId)) return true;
    if (currentIds.length >= 4) return false;
    const nextIds = [...currentIds, windowId];
    const prefs = readPreferences();
    if (!prefs.selectedWindows) prefs.selectedWindows = {};
    prefs.selectedWindows[key] = nextIds;
    return writePreferences(prefs);
  } else {
    // 关闭：下限最少保留 1 项
    if (!currentIds.includes(windowId)) return true;
    if (currentIds.length <= 1) return false;
    const nextIds = currentIds.filter((id) => id !== windowId);
    const prefs = readPreferences();
    if (!prefs.selectedWindows) prefs.selectedWindows = {};
    prefs.selectedWindows[key] = nextIds;
    return writePreferences(prefs);
  }
}

/** 清理账号时一并移除小组件配置 */
export function clearAccountWidgetPreferences(
  provider: ProviderId,
  accountId: string,
): boolean {
  const key = accountKey(provider, accountId);
  const prefs = readPreferences();
  if (!prefs.selectedWindows || !(key in prefs.selectedWindows)) return true;
  delete prefs.selectedWindows[key];
  return writePreferences(prefs);
}
