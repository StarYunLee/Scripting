import { Divider, Picker, Text, useState } from "scripting";
import * as ZaiSettings from "./credentials";
import { ZAI_WIDGET } from "./theme";

export function ZaiWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = ZaiSettings.getEffectiveSettings(props.profileId);

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
          ZaiSettings.setProfileSettings(props.profileId, {
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
      <Divider />
      {settings.widgetStyle === "dual" ? (
        <Picker
          title="概览内容"
          value={settings.dualQuotaPreset}
          onChanged={(value: string) => {
            ZaiSettings.setProfileSettings(props.profileId, {
              dualQuotaPreset: value as
                | "five_hour_weekly"
                | "five_hour_monthly"
                | "weekly_monthly",
            });
            changed();
          }}
          pickerStyle="menu"
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          <Text tag="five_hour_weekly">{ZAI_WIDGET.dualFiveHourWeekly}</Text>
          <Text tag="five_hour_monthly">{ZAI_WIDGET.dualFiveHourMonthly}</Text>
          <Text tag="weekly_monthly">{ZAI_WIDGET.dualWeeklyMonthly}</Text>
        </Picker>
      ) : (
        <Picker
          title="显示额度"
          value={settings.focusWindow}
          onChanged={(value: string) => {
            ZaiSettings.setProfileSettings(props.profileId, {
              focusWindow: value as
                | "five_hour"
                | "weekly"
                | "monthly"
                | "web_search",
            });
            changed();
          }}
          pickerStyle="menu"
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          <Text tag="five_hour">{ZAI_WIDGET.fiveHourTitle}</Text>
          <Text tag="weekly">{ZAI_WIDGET.weeklyTitle}</Text>
          <Text tag="monthly">{ZAI_WIDGET.monthlyTitle}</Text>
          <Text tag="web_search">{ZAI_WIDGET.webSearchTitle}</Text>
        </Picker>
      )}
    </>
  );
}
