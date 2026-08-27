import { Divider, Picker, Text, useState } from "scripting";
import { KIMI_WIDGET } from "./theme";
import * as KimiSettings from "./credentials";

export function KimiWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = KimiSettings.getEffectiveSettings(props.profileId);

  function changed() {
    setTick((value) => value + 1);
    props.onChanged();
  }

  return (
    <>
      <Picker
        title="小组件布局"
        value={settings.widgetStyle}
        onChanged={(value: string) => {
          KimiSettings.setProfileSettings(props.profileId, {
            widgetStyle: value as "dual" | "single",
          });
          changed();
        }}
        pickerStyle="menu"
        padding={{ vertical: true }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
      >
        <Text tag="dual">双额度概览</Text>
        <Text tag="single">单额度详情</Text>
      </Picker>
      {settings.widgetStyle === "single" ? (
        <>
          <Divider />
          <Picker
            title="显示额度"
            value={settings.focusWindow}
            onChanged={(value: string) => {
              KimiSettings.setProfileSettings(props.profileId, {
                focusWindow: value as "five_hour" | "weekly",
              });
              changed();
            }}
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text tag="five_hour">{KIMI_WIDGET.shortFiveHour}</Text>
            <Text tag="weekly">{KIMI_WIDGET.shortWeekly}</Text>
          </Picker>
        </>
      ) : null}
    </>
  );
}
