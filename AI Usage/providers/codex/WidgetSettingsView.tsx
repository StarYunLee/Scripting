import { Divider, Picker, Text, useState } from "scripting";
import * as CodexSettings from "./credentials";

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
        title="小组件布局"
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
            <Text tag="five_hour">5 小时额度</Text>
            <Text tag="weekly">每周额度</Text>
            <Text tag="monthly">每月额度</Text>
          </Picker>
        </>
      ) : null}
    </>
  );
}
