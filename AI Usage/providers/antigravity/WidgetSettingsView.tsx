import {
  Button,
  Divider,
  HStack,
  Image,
  Picker,
  Spacer,
  Text,
  useState,
} from "scripting";
import * as AntigravitySettings from "./credentials";
import { ANTIGRAVITY_GROUP } from "../../copy/labels";
import type { DualQuotaPreset, FocusWindow, WidgetStyle } from "./types";

const DUAL_PRESETS: Array<{ value: DualQuotaPreset; label: string }> = [
  {
    value: "gemini_five_hour_weekly",
    label: `${ANTIGRAVITY_GROUP.GEMINI_MODEL} · 5 小时 + 每周`,
  },
  {
    value: "third_party_five_hour_weekly",
    label: `${ANTIGRAVITY_GROUP.CLAUDE_AND_GPT} · 5 小时 + 每周`,
  },
  {
    value: "weekly_both",
    label: `${ANTIGRAVITY_GROUP.GEMINI_MODEL} · 每周 + ${ANTIGRAVITY_GROUP.CLAUDE_AND_GPT} · 每周`,
  },
];

const FOCUS_WINDOWS: Array<{ value: FocusWindow; label: string }> = [
  {
    value: "gemini_weekly",
    label: `${ANTIGRAVITY_GROUP.GEMINI_MODEL} · 每周`,
  },
  {
    value: "third_party_weekly",
    label: `${ANTIGRAVITY_GROUP.CLAUDE_AND_GPT} · 每周`,
  },
];

function optionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((item) => item.value === value)?.label || value;
}

function SelectionRow(props: {
  title: string;
  value: string;
  action: () => void | Promise<void>;
}) {
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      action={props.action}
    >
      <HStack
        alignment="center"
        spacing={12}
        padding={{ vertical: true }}
        frame={{ minHeight: 56, maxWidth: "infinity" }}
        contentShape="rect"
      >
        <Text
          fixedSize={{ horizontal: true, vertical: false }}
          layoutPriority={1}
        >
          {props.title}
        </Text>
        <Spacer minLength={8} />
        <Text
          foregroundStyle="accentColor"
          multilineTextAlignment="trailing"
          lineLimit={2}
          minScaleFactor={0.8}
          frame={{ maxWidth: 235, alignment: "trailing" }}
        >
          {props.value}
        </Text>
        <Image
          systemName="chevron.up.chevron.down"
          resizable
          scaleToFit
          foregroundStyle="accentColor"
          frame={{ width: 10, height: 14 }}
        />
      </HStack>
    </Button>
  );
}

export function AntigravityWidgetSettingsView(props: {
  profileId: string;
  onChanged: () => void;
}) {
  const [, setTick] = useState(0);
  const settings = AntigravitySettings.getEffectiveSettings(props.profileId);

  function changed() {
    setTick((value) => value + 1);
    props.onChanged();
  }

  async function chooseDualPreset() {
    const index = await Dialog.actionSheet({
      title: "选择概览内容",
      actions: DUAL_PRESETS.map((item) => ({ label: item.label })),
    });
    if (index == null) return;
    const selected = DUAL_PRESETS[index];
    if (!selected) return;
    AntigravitySettings.setProfileSettings(props.profileId, {
      dualQuotaPreset: selected.value,
    });
    changed();
  }

  async function chooseFocusWindow() {
    const index = await Dialog.actionSheet({
      title: "选择显示额度",
      actions: FOCUS_WINDOWS.map((item) => ({ label: item.label })),
    });
    if (index == null) return;
    const selected = FOCUS_WINDOWS[index];
    if (!selected) return;
    AntigravitySettings.setProfileSettings(props.profileId, {
      focusWindow: selected.value,
    });
    changed();
  }

  return (
    <>
      <Picker
        title="小组件布局"
        value={settings.widgetStyle}
        onChanged={(value: string) => {
          AntigravitySettings.setProfileSettings(props.profileId, {
            widgetStyle: value as WidgetStyle,
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
        <SelectionRow
          title="概览内容"
          value={optionLabel(DUAL_PRESETS, settings.dualQuotaPreset)}
          action={chooseDualPreset}
        />
      ) : (
        <SelectionRow
          title="显示额度"
          value={optionLabel(FOCUS_WINDOWS, settings.focusWindow)}
          action={chooseFocusWindow}
        />
      )}
    </>
  );
}
