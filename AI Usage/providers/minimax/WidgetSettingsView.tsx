import { Divider, Picker, Text, useState } from "scripting";
import { MINIMAX_WIDGET } from "./theme";
import * as MinimaxSettings from "./credentials";

export function MinimaxWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = MinimaxSettings.getEffectiveSettings(props.profileId);

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
          MinimaxSettings.setProfileSettings(props.profileId, {
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
              MinimaxSettings.setProfileSettings(props.profileId, {
                focusWindow: value as "five_hour" | "weekly",
              });
              changed();
            }}
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text tag="five_hour">{MINIMAX_WIDGET.shortFiveHour}</Text>
            <Text tag="weekly">{MINIMAX_WIDGET.shortWeekly}</Text>
          </Picker>
        </>
      ) : null}
    </>
  );
}
