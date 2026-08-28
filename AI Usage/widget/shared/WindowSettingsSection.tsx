import { Divider, Text, Toggle, useState, VStack } from "scripting";
import type { ProviderId } from "../../models";
import {
  getWidgetWindowSettings,
  setWidgetWindowSettings,
} from "../../services/widget-window-settings";
import { widgetWindowCandidatesFromCache } from "./window-candidates";
import { migrateLegacyCursorHiddenWindows } from "./window-settings-migration";

type Props = {
  provider: ProviderId;
  profileId: string;
  onChanged?: () => void;
};

/**
 * 统一的逐窗口显示设置：候选动态来自该账号最新缓存，
 * 全部隐藏是合法选择（小组件显示诚实空态）。
 */
export function WindowSettingsSection({
  provider,
  profileId,
  onChanged,
}: Props) {
  migrateLegacyCursorHiddenWindows(provider, profileId);
  const candidates = widgetWindowCandidatesFromCache(provider, profileId);
  const [settings, setSettings] = useState(() =>
    getWidgetWindowSettings(provider, profileId),
  );

  if (candidates.length === 0) {
    return (
      <Text foregroundStyle="secondaryLabel" font={13}>
        该账号暂无缓存用量，刷新后可在此选择隐藏的窗口。
      </Text>
    );
  }

  return (
    <VStack spacing={0}>
      {candidates.map((window, index) => {
        const visible = !settings.hiddenWindowIds.includes(window.id);
        return (
          <VStack spacing={0} key={window.id}>
            {index > 0 ? <Divider /> : null}
            <Toggle
              title={window.label}
              value={visible}
              onChanged={(value) => {
                // 快速连开时 state 可能陈旧，写入前必须重读共享存储里的当前值。
                const latest = getWidgetWindowSettings(provider, profileId);
                const rest = latest.hiddenWindowIds.filter(
                  (id) => id !== window.id,
                );
                const next = {
                  hiddenWindowIds: value ? rest : [...rest, window.id],
                };
                if (!setWidgetWindowSettings(provider, profileId, next)) return;
                setSettings(next);
                if (onChanged) onChanged();
              }}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
          </VStack>
        );
      })}
    </VStack>
  );
}
