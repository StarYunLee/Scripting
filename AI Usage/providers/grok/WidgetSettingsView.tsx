import { Picker, Text, useState } from "scripting";
import { GROK_WIDGET, GROK_WINDOW } from "../../copy/labels";
import * as GrokSettings from "./credentials";
import type { FocusWindow } from "./types";

export function GrokWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = GrokSettings.getEffectiveSettings(props.profileId);

  function changed() {
    setTick((value) => value + 1);
    props.onChanged();
  }

  return (
    <Picker
      title="显示额度"
      value={settings.focusWindow}
      onChanged={(value: string) => {
        GrokSettings.setProfileSettings(props.profileId, {
          focusWindow: value as FocusWindow,
        });
        changed();
      }}
      pickerStyle="menu"
      padding={{ vertical: true }}
      frame={{ minHeight: 44, maxWidth: "infinity" }}
    >
      <Text tag="weekly">{GROK_WIDGET.weeklyQuota}</Text>
      <Text tag="weekly_build">{GROK_WINDOW.BUILD}</Text>
    </Picker>
  );
}
