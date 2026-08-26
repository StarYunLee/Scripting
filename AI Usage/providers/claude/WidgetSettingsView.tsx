import { Divider, Picker, Text, useState } from "scripting";
import { CLAUDE_WIDGET } from "../../copy/labels";
import * as ClaudeSettings from "./credentials";

export function ClaudeWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = ClaudeSettings.getEffectiveSettings(props.profileId);

  function changed() {
    setTick((value) => value + 1);
    props.onChanged();
  }

  return (
    <>
      <Picker
        title="组件布局"
        value={settings.widgetStyle}
        onChanged={(value: string) => {
          ClaudeSettings.setProfileSettings(props.profileId, {
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
            ClaudeSettings.setProfileSettings(props.profileId, {
              dualQuotaPreset: value as "five_hour_weekly" | "weekly_fable",
            });
            changed();
          }}
          pickerStyle="menu"
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          <Text tag="five_hour_weekly">{CLAUDE_WIDGET.dualFiveHourWeekly}</Text>
          <Text tag="weekly_fable">{CLAUDE_WIDGET.dualWeeklyFable}</Text>
        </Picker>
      ) : (
        <Picker
          title="显示额度"
          value={settings.focusWindow}
          onChanged={(value: string) => {
            ClaudeSettings.setProfileSettings(props.profileId, {
              focusWindow: value as "five_hour" | "weekly" | "weekly_fable",
            });
            changed();
          }}
          pickerStyle="menu"
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          <Text tag="five_hour">{CLAUDE_WIDGET.fiveHourQuota}</Text>
          <Text tag="weekly">{CLAUDE_WIDGET.shortWeekly}</Text>
          <Text tag="weekly_fable">{CLAUDE_WIDGET.shortFableWeekly}</Text>
        </Picker>
      )}
    </>
  );
}
