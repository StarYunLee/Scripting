/**
 * DeepSeek 不提供手动币种设置：展示币种完全由接口数据自动决定
 * （CNY → USD → 响应首个币种）。本模块只保留 cleanup-only 的历史偏好清理，
 * 供账号删除时移除遗留的 selectedWindows["deepseek:<profileId>"] 条目；
 * 清理时原样保留其他账号、其他 provider 条目与未知字段。
 *
 * 存储结构与小组件窗口偏好一致（便于备份/恢复天然覆盖）：
 * selectedWindows["deepseek:<profileId>"] = ["deepseek:balance:<CUR>"]
 */
const LIVE_STORAGE_KEY = "ai_usage_widget_window_preferences_v1";
const DEMO_STORAGE_KEY = "ai_usage_demo_widget_window_preferences_v1";
const PROVIDER_KEY = "deepseek";

type StoredPreferences = Record<string, unknown> & {
  selectedWindows?: unknown;
};

function storageKey(profileId: string): string {
  return profileId.startsWith("demo_") ? DEMO_STORAGE_KEY : LIVE_STORAGE_KEY;
}

function accountKey(profileId: string): string {
  return `${PROVIDER_KEY}:${profileId}`;
}

function readPreferences(profileId: string): StoredPreferences {
  try {
    const value = Storage.get<unknown>(storageKey(profileId));
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  } catch {
    return {};
  }
}

/** 原样复制 selectedWindows，保留其他账号与未知字段。 */
function selectedWindowsOf(
  preferences: StoredPreferences,
): Record<string, unknown> {
  const value = preferences.selectedWindows;
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/** 清理本账号的历史币种偏好；空 id、无条目或存储故障均静默跳过。 */
export function clearWidgetSettings(profileId?: string | null): void {
  if (!profileId) return;
  const preferences = readPreferences(profileId);
  const windows = selectedWindowsOf(preferences);
  const key = accountKey(profileId);
  if (!(key in windows)) return;
  delete windows[key];
  try {
    Storage.set(storageKey(profileId), {
      ...preferences,
      selectedWindows: windows,
    });
  } catch {
    /* 清理失败不阻塞账号删除 */
  }
}
