import { Divider, Picker, Text, useState } from "scripting";
import * as CodexSettings from "./credentials";
import { codexWindowTitle } from "./window-titles";

export function CodexWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = CodexSettings.getEffectiveSettings(props.profileId);

  function changed() {
    setTick((value) => value + 1);
    props.onChanged();
  }

  return (
    <>
      <Picker
        title="组件布局"
        value={settings.widgetLayout}
        onChanged={(value: string) => {
          CodexSettings.setProfileSettings(props.profileId, {
            widgetLayout: value as "detail" | "overview",
          });
          changed();
        }}
        pickerStyle="menu"
        padding={{ vertical: true }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
      >
        <Text tag="detail">单额度详情</Text>
        <Text tag="overview">双额度概览</Text>
      </Picker>

      {settings.widgetLayout === "detail" ? (
        <>
          <Divider />
          <Picker
            title="显示额度"
            value={settings.focusWindow}
            onChanged={(value: string) => {
              CodexSettings.setProfileSettings(props.profileId, {
                focusWindow: value as "five_hour" | "weekly" | "monthly",
              });
              changed();
            }}
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text tag="five_hour">{codexWindowTitle("five_hour")}</Text>
            <Text tag="weekly">{codexWindowTitle("weekly")}</Text>
            <Text tag="monthly">{codexWindowTitle("monthly")}</Text>
          </Picker>
        </>
      ) : null}
    </>
  );
}
