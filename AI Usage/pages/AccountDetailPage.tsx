import {
  Button,
  HStack,
  List,
  Navigation,
  Picker,
  Section,
  Spacer,
  Text,
  VStack,
  Widget,
  useState,
} from "scripting";
import { CodexWidgetSettingsView } from "../providers/codex/WidgetSettingsView";
import { ClaudeWidgetSettingsView } from "../providers/claude/WidgetSettingsView";
import { AntigravityWidgetSettingsView } from "../providers/antigravity/WidgetSettingsView";
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
import { requestWidgetReload } from "../services/widgets";

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
  demo?: boolean;
  backgroundTheme: BackgroundThemeId;
  onReauthorize: () => void;
  onDelete: () => void;
}) {
  const dismiss = Navigation.useDismiss();
  const [previewFamily, setPreviewFamily] = useState<
    "choose" | "systemSmall" | "systemMedium"
  >("choose");
  const meta = providerMeta(props.provider);
  const title = props.account.email || props.account.name;

  function changed() {
    requestWidgetReload();
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
    props.onDelete();
    dismiss();
  }

  return (
    <List
      navigationTitle={meta.title}
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

      {meta.capabilities.widget ? (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="小组件设置" />}
        >
          <GlassGroup>
            {props.provider === "codex" ? (
              <CodexWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "grok" ||
              props.provider === "cursor" ? null : props.provider ===
              "claude" ? (
              <ClaudeWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : (
              <AntigravityWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            )}

            {props.provider === "grok" || props.provider === "cursor" ? null : (
              <GlassDivider />
            )}
            <Picker
              title="组件预览"
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
              title="复制组件参数"
              action={async () => {
                await Pasteboard.setString(
                  widgetParameter(props.provider, props.account.id),
                );
                await Dialog.alert({
                  title: "已复制组件参数",
                  message:
                    "请长按主屏幕上的 AI Usage 小组件并选择“编辑小组件”，将内容粘贴到“参数”。",
                  buttonLabel: "知道了",
                });
              }}
            />
            <GlassDivider />
            <GlassNoteRow text="长按主屏幕上的 AI Usage 小组件 → 编辑小组件，将复制的内容粘贴到“参数”。同一账号的多个小组件共享这里的显示设置。" />
          </GlassGroup>
        </Section>
      ) : null}

      {props.demo ? null : (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="删除账号" />}
        >
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
