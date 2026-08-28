import type { ProviderId } from "../../models";
import {
  clearProfileSettings as clearLegacyCursorProfileSettings,
  getEffectiveSettings as getLegacyCursorSettings,
} from "../../providers/cursor/widget-settings";
import {
  hasWidgetWindowSettings,
  setWidgetWindowSettings,
} from "../../services/widget-window-settings";

/** 旧 Cursor 设置里的窗口名 → 新通用窗口 id（不带 provider 前缀）。 */
const LEGACY_NAME_TO_WINDOW_ID: Record<string, string> = {
  auto: "auto",
  total: "total",
  api: "api",
  grok_bot: "grok_bot",
  // 旧设置按 name 存「weekly」，解析器给该窗口的 id 是 requests。
  weekly: "requests",
};

/**
 * 一次性迁移：把旧 Cursor 逐窗口 hiddenWindows（按 name）搬进通用设置。
 * 只在该账号尚无通用选择时执行；成功后清掉旧条目保证幂等。
 */
export function migrateLegacyCursorHiddenWindows(
  provider: ProviderId,
  profileId: string,
): void {
  if (provider !== "cursor" || !profileId) return;
  const legacy = getLegacyCursorSettings(profileId);
  if (legacy.hiddenWindows.length === 0) return;
  if (hasWidgetWindowSettings(provider, profileId)) return;
  const mapped = legacy.hiddenWindows
    .flatMap((name) => {
      const id = LEGACY_NAME_TO_WINDOW_ID[name];
      return id ? [`cursor:${id}`] : [];
    });
  if (mapped.length === 0) {
    clearLegacyCursorProfileSettings(profileId);
    return;
  }
  const persisted = setWidgetWindowSettings(provider, profileId, {
    hiddenWindowIds: mapped,
  });
  if (persisted) clearLegacyCursorProfileSettings(profileId);
}
