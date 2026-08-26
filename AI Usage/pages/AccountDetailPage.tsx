import type { VStackProps } from "scripting";
import {
  Button,
  Divider,
  HStack,
  List,
  Navigation,
  Picker,
  Rectangle,
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
import { CursorWidgetSettingsView } from "../providers/cursor/WidgetSettingsView";
import { KimiWidgetSettingsView } from "../providers/kimi/WidgetSettingsView";
import { CopilotWidgetSettingsView } from "../providers/copilot/WidgetSettingsView";
import { ZaiWidgetSettingsView } from "../providers/zai/WidgetSettingsView";
import { MinimaxWidgetSettingsView } from "../providers/minimax/WidgetSettingsView";
import { GrokWidgetSettingsView } from "../providers/grok/WidgetSettingsView";
import { providerMeta, type ProviderId } from "../models";
import { accountTitle } from "../services/hub";
import { widgetParameter } from "../widget/parameter";
import { PageBackground } from "../components/PageBackground";
import type { BackgroundThemeId } from "../services/settings";
import { requestWidgetReload } from "../services/widgets";

type Account = { id: string; name: string; email: string | null };

function DetailRowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
    />
  );
}

const detailRowBackground = <DetailRowBackground />;

function DetailGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: "infinity" }}
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
    >
      {props.children}
    </VStack>
  );
}

function DetailDivider() {
  return <Divider />;
}

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

function DetailFooter(props: { children: string }) {
  return (
    <Text
      font="caption"
      foregroundStyle="secondaryLabel"
      listRowBackground={<Rectangle fill="clear" />}
    >
      {props.children}
    </Text>
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
  const title = accountTitle(props.account);

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
        listRowBackground={detailRowBackground}
        header={<Text font="footnote" foregroundStyle="secondaryLabel">账号信息</Text>}
        footer={
          props.demo ? (
            <DetailFooter>
              演示账号使用本地样例数据，不发起授权或网络请求。
            </DetailFooter>
          ) : undefined
        }
      >
        <DetailGroup>
          <HStack
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text font="body" lineLimit={1} truncationMode="tail">
              {title}
            </Text>
            <Spacer />
          </HStack>
          {props.demo ? null : (
            <>
              <DetailDivider />
              <DetailActionRow title="重新授权" action={props.onReauthorize} />
              <DetailDivider />
              <DetailActionRow
                title="删除账号…"
                destructive={true}
                action={async () => {
                  const confirmed = await Dialog.confirm({
                    title: "删除账号",
                    message: `确定要删除“${title}”吗？账号凭据、缓存和小组件设置将一并清除。`,
                    cancelLabel: "取消",
                    confirmLabel: "删除",
                  });
                  if (!confirmed) return;
                  props.onDelete();
                  dismiss();
                }}
              />
            </>
          )}
        </DetailGroup>
      </Section>

      {meta.capabilities.widget ? (
        <Section
          listRowBackground={detailRowBackground}
          header={<Text font="footnote" foregroundStyle="secondaryLabel">小组件设置</Text>}
          footer={
            <DetailFooter>
              长按主屏幕上的 AI Usage 小组件 →
              编辑小组件，将复制的内容粘贴到“参数”。同一账号的多个小组件共享这里的显示设置。
            </DetailFooter>
          }
        >
          <DetailGroup>
            {props.provider === "codex" ? (
              <CodexWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "claude" ? (
              <ClaudeWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "cursor" ? (
              <CursorWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "kimi" ? (
              <KimiWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "copilot" ? (
              <CopilotWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "zai" ? (
              <ZaiWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "minimax" ? (
              <MinimaxWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : props.provider === "grok" ? (
              <GrokWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            ) : (
              <AntigravityWidgetSettingsView
                profileId={props.account.id}
                onChanged={changed}
              />
            )}

            <DetailDivider />
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
            <DetailDivider />
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
          </DetailGroup>
        </Section>
      ) : null}
    </List>
  );
}
