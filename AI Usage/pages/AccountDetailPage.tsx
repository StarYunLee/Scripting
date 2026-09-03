import {
  Button,
  HStack,
  List,
  Navigation,
  Picker,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
  Widget,
  useState,
} from "scripting";
import { providerMeta, type ProviderId } from "../models";
import { widgetParameter } from "../widget/parameter";
import { PageBackground } from "../components/PageBackground";
import { PlanBadge } from "../components/PlanBadge";
import { ProviderLogo } from "../components/ProviderLogo";
import {
  GlassDivider,
  GlassGroup,
  GlassNoteRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/GlassList";
import type { BackgroundThemeId } from "../services/settings";
import { requestWidgetReloadAfterStorage } from "../services/widgets";
import type { UsageWindowView } from "../models";
import {
  isWindowShownInOverview,
  setWindowShownInOverview,
} from "../services/app-overview-prefs";
import {
  isWindowSelectedForWidget,
  toggleWidgetWindowSelection,
} from "../services/widget-prefs";

type Account = {
  id: string;
  name: string;
  email: string | null;
  planLabel?: string | null;
};

function DetailActionRow(props: {
  title: string;
  action: () => void | Promise<void>;
  destructive?: boolean;
}) {
  return (
    <Button
      buttonStyle="plain"
      role={props.destructive ? "destructive" : undefined}
      frame={{ maxWidth: "infinity" }}
      action={props.action}
    >
      <HStack
        padding={{ vertical: true }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
        contentShape="rect"
      >
        <Text foregroundStyle={props.destructive ? "systemRed" : "accentColor"}>
          {props.title}
        </Text>
        <Spacer />
      </HStack>
    </Button>
  );
}

export function AccountDetailPage(props: {
  provider: ProviderId;
  account: Account;
  overviewWindows: UsageWindowView[];
  onOverviewChange: () => void;
  demo?: boolean;
  backgroundTheme: BackgroundThemeId;
  onReauthorize: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const dismiss = Navigation.useDismiss();
  const [previewFamily, setPreviewFamily] = useState<
    "choose" | "systemSmall" | "systemMedium"
  >("choose");
  const [overviewTick, setOverviewTick] = useState(0);
  const [widgetTick, setWidgetTick] = useState(0);
  const meta = providerMeta(props.provider);
  const title = props.account.email || props.account.name;

  function changed() {
    requestWidgetReloadAfterStorage();
  }

  async function previewWidget(
    family: "systemSmall" | "systemMedium",
  ): Promise<void> {
    const parameter = widgetParameter(props.provider, props.account.id);
    try {
      await Widget.preview({
        family,
        parameters: {
          options: { [parameter]: JSON.stringify(parameter) },
          default: parameter,
        },
      });
    } catch (error) {
      await Dialog.alert({
        title: "无法预览小组件",
        message:
          error instanceof Error && error.message
            ? error.message
            : "请稍后重试，或通过 Scripting 调试页面预览。",
        buttonLabel: "关闭",
      });
    }
  }

  async function confirmDelete() {
    const confirmed = await Dialog.confirm({
      title: "删除账号",
      message: `确定要删除“${title}”吗？账号凭据、缓存和小组件设置将一并清除。`,
      cancelLabel: "取消",
      confirmLabel: "删除",
    });
    if (!confirmed) return;
    try {
      await props.onDelete();
      dismiss();
    } catch (error) {
      await Dialog.alert({
        title: "删除失败",
        message:
          error instanceof Error && error.message
            ? error.message
            : "账号未删除，请稍后重试。",
        buttonLabel: "关闭",
      });
    }
  }

  return (
    <List
      navigationTitle={meta.title}
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      listStyle="plain"
      listRowSeparator="hidden"
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
        header={<GlassSectionHeader title="账号信息" />}
      >
        <GlassGroup>
          <HStack
            alignment="center"
            spacing={12}
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            <ProviderLogo provider={props.provider} size={28} />
            <VStack alignment="leading" spacing={4}>
              <PlanBadge
                provider={props.provider}
                label={props.account.planLabel || meta.title}
                size="regular"
              />
              <Text font="body" lineLimit={1} truncationMode="tail">
                {title}
              </Text>
            </VStack>
            <Spacer />
          </HStack>
          {props.demo ? (
            <>
              <GlassDivider />
              <GlassNoteRow text="演示账号使用本地样例数据，不发起授权或网络请求。" />
            </>
          ) : (
            <>
              <GlassDivider />
              <DetailActionRow title="重新授权" action={props.onReauthorize} />
            </>
          )}
        </GlassGroup>
      </Section>

      {props.overviewWindows.length > 0 ? (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="用量总览" />}
        >
          <GlassGroup>
            {props.overviewWindows.map((window, index) => (
              <VStack
                key={`${window.id}:${overviewTick}`}
                alignment="leading"
                spacing={0}
                frame={{ maxWidth: "infinity" }}
              >
                <Toggle
                  title={window.label}
                  toggleStyle="switch"
                  value={isWindowShownInOverview(
                    props.provider,
                    props.account.id,
                    window.id,
                  )}
                  onChanged={(value: boolean) => {
                    const changed = setWindowShownInOverview(
                      props.provider,
                      props.account.id,
                      props.overviewWindows,
                      window.id,
                      value,
                    );
                    if (changed) {
                      props.onOverviewChange();
                      setOverviewTick((current) => current + 1);
                    } else {
                      void Dialog.alert({
                        title: "设置未保存",
                        message:
                          "无法保存额度窗口设置，或当前账号必须至少保留一个可见窗口。",
                        buttonLabel: "知道了",
                      });
                      setOverviewTick((current) => current + 1);
                    }
                  }}
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                />
                {index < props.overviewWindows.length - 1 ? (
                  <GlassDivider />
                ) : null}
              </VStack>
            ))}
            <GlassDivider />
            <GlassNoteRow text="只影响 App 用量页，不影响桌面小组件。" />
          </GlassGroup>
        </Section>
      ) : null}

      {meta.capabilities.widget && props.overviewWindows.length > 0 ? (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="桌面小组件" />}
        >
          <GlassGroup>
            {props.overviewWindows.map((window, index) => {
              const isSelected = isWindowSelectedForWidget(
                props.provider,
                props.account.id,
                props.overviewWindows,
                window.id,
              );
              return (
                <VStack
                  key={`widget-win:${window.id}:${widgetTick}`}
                  alignment="leading"
                  spacing={0}
                  frame={{ maxWidth: "infinity" }}
                >
                  <Toggle
                    title={window.label}
                    toggleStyle="switch"
                    value={isSelected}
                    onChanged={(value: boolean) => {
                      const success = toggleWidgetWindowSelection(
                        props.provider,
                        props.account.id,
                        props.overviewWindows,
                        window.id,
                        value,
                      );
                      if (success) {
                        changed();
                        setWidgetTick((current) => current + 1);
                      } else {
                        void Dialog.alert({
                          title: value
                            ? "选择失败"
                            : "至少保留 1 项或设置未保存",
                          message: value
                            ? "中尺寸小组件最多同时展示 4 个额度窗口，或本地设置暂时无法写入。"
                            : "小组件必须至少展示 1 个额度窗口；若仍有其他窗口，请稍后重试保存。",
                          buttonLabel: "知道了",
                        });
                        setWidgetTick((current) => current + 1);
                      }
                    }}
                    padding={{ vertical: true }}
                    frame={{ minHeight: 44, maxWidth: "infinity" }}
                  />
                  {index < props.overviewWindows.length - 1 ? (
                    <GlassDivider />
                  ) : null}
                </VStack>
              );
            })}
            <GlassDivider />
            <GlassNoteRow text="小尺寸最多 2 项，中尺寸最多 4 项。同一账号共用。" />
          </GlassGroup>
        </Section>
      ) : null}

      {meta.capabilities.widget ? (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="预览与参数" />}
        >
          <GlassGroup>
            <Picker
              title="小组件预览"
              value={previewFamily}
              onChanged={(value: string) => {
                if (value !== "systemSmall" && value !== "systemMedium") {
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
            </Picker>
            <GlassDivider />
            <DetailActionRow
              title="复制小组件参数"
              action={async () => {
                const param = widgetParameter(props.provider, props.account.id);
                await Pasteboard.setString(param);
                await Dialog.alert({
                  title: "已复制小组件参数",
                  message: param,
                  buttonLabel: "知道了",
                });
              }}
            />
            <GlassDivider />
            <GlassNoteRow text="复制后长按主屏幕小组件，在“编辑小组件”中粘贴到“参数”。" />
          </GlassGroup>
        </Section>
      ) : null}

      {props.demo ? null : (
        <Section listRowBackground={glassRowBackground}>
          <GlassGroup>
            <DetailActionRow
              title="删除此账号…"
              destructive={true}
              action={confirmDelete}
            />
          </GlassGroup>
        </Section>
      )}
    </List>
  );
}
