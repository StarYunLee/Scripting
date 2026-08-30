import {
  HStack,
  List,
  Picker,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
  Widget,
  useState,
} from "scripting";
import { ProviderLogo } from "../components/ProviderLogo";
import {
  GlassDivider,
  GlassGroup,
  GlassNoteRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/GlassList";
import { PageBackground } from "../components/PageBackground";
import { providerMeta, type UsageCard } from "../models";
import type { BackgroundThemeId } from "../services/settings";
import {
  getDashboardWidgetPreferences,
  setDashboardWidgetAccountVisible,
  setDashboardWidgetAccountWindows,
} from "../services/dashboard-widget-prefs";
import { requestWidgetReloadAfterStorage } from "../services/widgets";

export function DashboardWidgetSettingsPage(props: {
  cards: UsageCard[];
  backgroundTheme: BackgroundThemeId;
}) {
  const [tick, setTick] = useState(0);
  const [previewFamily, setPreviewFamily] = useState<
    "choose" | "systemSmall" | "systemMedium" | "systemLarge"
  >("choose");
  const preferences = getDashboardWidgetPreferences();

  function changed() {
    setTick((value) => value + 1);
    requestWidgetReloadAfterStorage();
  }

  async function previewWidget(
    family: "systemSmall" | "systemMedium" | "systemLarge",
  ): Promise<void> {
    try {
      await Widget.preview({
        family,
        parameters: {
          options: { dashboard: JSON.stringify("dashboard") },
          default: "dashboard",
        },
      });
    } catch (error) {
      await Dialog.alert({
        title: "无法预览多账号小组件",
        message:
          error instanceof Error && error.message
            ? error.message
            : "请查看运行记录，或在主屏幕重新添加小组件后重试。",
        buttonLabel: "关闭",
      });
    }
  }
  void tick;

  return (
    <List
      navigationTitle="账号配置"
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      listStyle="plain"
      listRowSpacing={12}
      listSectionSpacing={12}
      contentMargins={{
        edges: "horizontal",
        insets: 16,
        placement: "scrollContent",
      }}
      background={<PageBackground theme={props.backgroundTheme} />}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="预览" />}
      >
        <GlassGroup>
          <Picker
            title="多账号小组件预览"
            value={previewFamily}
            onChanged={(value: string) => {
              if (
                value !== "systemSmall" &&
                value !== "systemMedium" &&
                value !== "systemLarge"
              ) {
                return;
              }
              setPreviewFamily(value);
              void previewWidget(value).finally(() => {
                setPreviewFamily("choose");
              });
            }}
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text tag="choose">选择尺寸</Text>
            <Text tag="systemSmall">Small 小组件</Text>
            <Text tag="systemMedium">Medium 小组件</Text>
            <Text tag="systemLarge">Large 小组件</Text>
          </Picker>
          <GlassDivider />
          <GlassNoteRow text="按当前账号与额度设置预览所选尺寸。预览与主屏幕的实际尺寸、圆角和刷新时机可能略有差异。" />
        </GlassGroup>
      </Section>

      {props.cards.length > 0 ? (
        props.cards.map((card, index) => {
          const meta = providerMeta(card.provider);
          const visible = !preferences.hiddenAccountKeys.includes(card.key);
          const configured = preferences.windowIdsByAccount[card.key];
          const primary = configured?.[0] || card.windows[0]?.id || "";
          const secondary = configured?.[1] || card.windows[1]?.id || "none";
          return (
            <Section
              key={`${card.key}:${tick}`}
              listRowBackground={glassRowBackground}
              header={
                index === 0 ? (
                  <GlassSectionHeader title="账号与额度" />
                ) : undefined
              }
            >
              <GlassGroup>
                <HStack
                  spacing={10}
                  padding={{ vertical: true }}
                  frame={{ minHeight: 52, maxWidth: "infinity" }}
                >
                  <ProviderLogo provider={card.provider} size={22} />
                  <VStack alignment="leading" spacing={3}>
                    <Text
                      font="body"
                      fontWeight="medium"
                      lineLimit={1}
                      truncationMode="tail"
                    >
                      {card.title}
                    </Text>
                    <Text
                      font={13}
                      foregroundStyle="secondaryLabel"
                      lineLimit={1}
                    >
                      {card.planLabel && card.planLabel !== meta.title
                        ? `${meta.title} · ${card.planLabel}`
                        : meta.title}
                    </Text>
                  </VStack>
                  <Spacer />
                  <Toggle
                    title={`在多账号小组件中显示 ${card.title}`}
                    labelsHidden
                    toggleStyle="switch"
                    value={visible}
                    onChanged={(value: boolean) => {
                      setDashboardWidgetAccountVisible(card.key, value);
                      changed();
                    }}
                  />
                </HStack>
                {visible && card.windows.length > 0 ? (
                  <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
                    <GlassDivider />
                    <Picker
                      title="额度窗口 1"
                      value={primary}
                      onChanged={(value: string) => {
                        const nextSecondary =
                          secondary !== "none" && secondary !== value
                            ? secondary
                            : card.windows.find((window) => window.id !== value)
                                ?.id || "none";
                        setDashboardWidgetAccountWindows(card.key, [
                          value,
                          ...(nextSecondary === "none" ? [] : [nextSecondary]),
                        ]);
                        changed();
                      }}
                      pickerStyle="menu"
                      padding={{ vertical: true }}
                      frame={{ minHeight: 44, maxWidth: "infinity" }}
                    >
                      {card.windows.map((window) => (
                        <Text key={window.id} tag={window.id}>
                          {window.label}
                        </Text>
                      ))}
                    </Picker>
                    <GlassDivider />
                    <Picker
                      title="额度窗口 2"
                      value={secondary}
                      onChanged={(value: string) => {
                        setDashboardWidgetAccountWindows(card.key, [
                          primary,
                          ...(value === "none" ? [] : [value]),
                        ]);
                        changed();
                      }}
                      pickerStyle="menu"
                      padding={{ vertical: true }}
                      frame={{ minHeight: 44, maxWidth: "infinity" }}
                    >
                      <Text tag="none">不显示</Text>
                      {card.windows
                        .filter((window) => window.id !== primary)
                        .map((window) => (
                          <Text key={window.id} tag={window.id}>
                            {window.label}
                          </Text>
                        ))}
                    </Picker>
                    {index === 0 ? (
                      <>
                        <GlassDivider />
                        <GlassNoteRow text="每个账号最多 2 个额度窗口，只作用于多账号小组件。" />
                      </>
                    ) : null}
                  </VStack>
                ) : null}
                {visible && card.windows.length === 0 ? (
                  <GlassNoteRow text="暂无额度窗口，请先刷新账号用量。" />
                ) : null}
              </GlassGroup>
            </Section>
          );
        })
      ) : (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="账号与额度" />}
        >
          <GlassGroup>
            <GlassNoteRow text="暂无可配置账号，请先连接账号并刷新用量。" />
          </GlassGroup>
        </Section>
      )}
    </List>
  );
}
