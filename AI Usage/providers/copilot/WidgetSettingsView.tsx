import { Divider, Picker, Text, useState } from "scripting";
import { COPILOT_WINDOW } from "../../copy/labels";
import * as CopilotSettings from "./credentials";

export function CopilotWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = CopilotSettings.getEffectiveSettings(props.profileId);

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
          CopilotSettings.setProfileSettings(props.profileId, {
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
            CopilotSettings.setProfileSettings(props.profileId, {
              dualQuotaPreset: value as
                | "credits_chat"
                | "credits_completions"
                | "chat_completions",
            });
            changed();
          }}
          pickerStyle="menu"
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          <Text tag="credits_chat">
            {`${COPILOT_WINDOW.CREDITS} + ${COPILOT_WINDOW.CHAT}`}
          </Text>
          <Text tag="credits_completions">
            {`${COPILOT_WINDOW.CREDITS} + ${COPILOT_WINDOW.COMPLETIONS}`}
          </Text>
          <Text tag="chat_completions">
            {`${COPILOT_WINDOW.CHAT} + ${COPILOT_WINDOW.COMPLETIONS}`}
          </Text>
        </Picker>
      ) : (
        <Picker
          title="显示额度"
          value={settings.focusWindow}
          onChanged={(value: string) => {
            CopilotSettings.setProfileSettings(props.profileId, {
              focusWindow: value as "credits" | "chat" | "completions",
            });
            changed();
          }}
          pickerStyle="menu"
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          <Text tag="credits">{COPILOT_WINDOW.CREDITS}</Text>
          <Text tag="chat">{COPILOT_WINDOW.CHAT}</Text>
          <Text tag="completions">{COPILOT_WINDOW.COMPLETIONS}</Text>
        </Picker>
      )}
    </>
  );
}
