import { Divider, Toggle, useState, VStack } from "scripting";
import { CURSOR_WINDOW } from "../../copy/labels";
import { CURSOR_WINDOW_NAMES } from "./types";
import * as CursorSettings from "./credentials";

/** 窗口 name → 面板标签；plan 窗口运行时标签是套餐/按需之一，故并列展示 */
const WINDOW_LABELS: Record<string, string> = {
  auto: CURSOR_WINDOW.AUTO,
  total: CURSOR_WINDOW.TOTAL,
  api: CURSOR_WINDOW.API,
  grok_bot: CURSOR_WINDOW.GROK_BOT,
  plan: `${CURSOR_WINDOW.PLAN} / ${CURSOR_WINDOW.ON_DEMAND}`,
  weekly: CURSOR_WINDOW.REQUEST,
};

export function CursorWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = CursorSettings.getEffectiveSettings(props.profileId);

  function changed() {
    setTick((value) => value + 1);
    props.onChanged();
  }

  return (
    <>
      {CURSOR_WINDOW_NAMES.map((name, index) => (
        <VStack key={name} spacing={0}>
          {index > 0 ? <Divider /> : null}
          <Toggle
            title={WINDOW_LABELS[name] || name}
            value={!settings.hiddenWindows.includes(name)}
            onChanged={(visible: boolean) => {
              const rest = settings.hiddenWindows.filter(
                (item) => item !== name,
              );
              CursorSettings.setProfileSettings(props.profileId, {
                hiddenWindows: visible ? rest : [...rest, name],
              });
              changed();
            }}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
        </VStack>
      ))}
    </>
  );
}
