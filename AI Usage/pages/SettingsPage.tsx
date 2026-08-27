import type { VStackProps } from "scripting";
import {
  Button,
  Divider,
  HStack,
  Image,
  List,
  NavigationStack,
  Picker,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
  Widget,
  useMemo,
  useState,
} from "scripting";
import { PROVIDERS, type ProviderId } from "../models";
import {
  deleteAuthorizedAccount,
  isAuthorized,
  listProviderAccounts,
} from "../services/hub";
import { cancelProviderAuth, completeProviderAuth } from "../services/hub-auth";
import {
  BACKGROUND_THEMES,
  getAppDisplaySettings,
  setAppReloadMinutes,
  type BackgroundThemeId,
} from "../services/settings";
import { launchProviderAuthorization } from "../services/auth-flow";
import { AuthSheetView } from "../components/AuthSheetView";
import { PageBackground } from "../components/PageBackground";
import { ProviderLogo } from "../components/ProviderLogo";
import { usePageToolbar } from "../components/PageToolbar";
import { CURRENT_VERSION } from "../changelog";
import { ChangelogPage } from "./ChangelogPage";
import { AccountDetailPage } from "./AccountDetailPage";
import { DashboardPrefsPage } from "./DashboardPrefsPage";
import { LogPage } from "./LogPage";
import type { AuthSheet } from "../models";
import { listDemoAccounts } from "../services/demo";
import { requestWidgetReload } from "../services/widgets";
import {
  APP_DASHBOARD_SETTINGS_FOOTER,
  WIDGET_DASHBOARD_SETTINGS_FOOTER,
} from "../copy/labels";
import { WIDGET_DASHBOARD_PARAMETER } from "../widget/parameter";

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

const RELOAD_MINUTE_OPTIONS = [5, 10, 15, 30, 60];

/** 把旧版遗留的任意刷新间隔吸附到最近档位，保证 Picker 有选中项 */
function snapReloadMinutes(value: number): number {
  let nearest = RELOAD_MINUTE_OPTIONS[0];
  for (const option of RELOAD_MINUTE_OPTIONS) {
    if (Math.abs(option - value) < Math.abs(nearest - value)) nearest = option;
  }
  return nearest;
}

type SelectedDestination =
  | {
      kind: "account";
      provider: ProviderId;
      account: { id: string; name: string; email: string | null };
    }
  | { kind: "log" }
  | { kind: "changelog" }
  | { kind: "dashboard" }
  | { kind: "widget-dashboard" };

function SettingsRowBackground() {
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

const settingsRowBackground = <SettingsRowBackground />;

function SettingsGroup(props: { children: VStackProps["children"] }) {
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

function CardDivider() {
  return <Divider />;
}

export function SettingsPage(props: {
  demoMode: boolean;
  backgroundTheme: BackgroundThemeId;
  onDemoModeChange: (enabled: boolean) => void;
  onBackgroundThemeChange: (theme: BackgroundThemeId) => void;
  onDashboardPrefsChange?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [sheet, setSheet] = useState<AuthSheet | null>(null);
  const [selectedDestination, setSelectedDestination] =
    useState<SelectedDestination | null>(null);
  const [busy, setBusy] = useState(false);
  const [dashboardPreviewFamily, setDashboardPreviewFamily] = useState<
    "choose" | "systemSmall" | "systemMedium" | "systemLarge"
  >("choose");
  // tick 变化（refresh()）时重读 Storage，其余重渲染复用
  const settings = useMemo(() => getAppDisplaySettings(), [tick]);

  function refresh() {
    setTick((value) => value + 1);
  }

  async function previewDashboardWidget(
    family: "systemSmall" | "systemMedium" | "systemLarge",
  ): Promise<void> {
    try {
      await Widget.preview({
        family,
        parameters: {
          options: {
            [WIDGET_DASHBOARD_PARAMETER]: JSON.stringify(
              WIDGET_DASHBOARD_PARAMETER,
            ),
          },
          default: WIDGET_DASHBOARD_PARAMETER,
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

  async function reloadHomeScreenWidgets() {
    const requested = requestWidgetReload();
    await Dialog.alert({
      title: requested ? "已请求刷新" : "请求刷新失败",
      message: requested
        ? "已请求重新加载 Scripting 的所有小组件，实际显示更新时间由 iOS 决定。"
        : "无法请求系统重新加载小组件，请稍后重试。",
      buttonLabel: "关闭",
    });
  }

  async function startAuth(provider: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const launched = await launchProviderAuthorization(provider, profileId);
      if (launched.autoCompleted) {
        requestWidgetReload();
        refresh();
        return;
      }
      if (!launched.needsSheet) return;
      setSheet({
        provider,
        profileId: launched.profileId,
        authorizationInput: "",
        status: launched.status,
      });
    } catch (error) {
      setSheet({
        provider,
        profileId: profileId || provider,
        authorizationInput: "",
        status: "启动授权失败：" + errorText(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth() {
    if (!sheet || busy) return;
    setBusy(true);
    try {
      setSheet({ ...sheet, status: "正在验证授权…" });
      await completeProviderAuth(sheet.provider, sheet.authorizationInput);
      setSheet(null);
      requestWidgetReload();
      refresh();
    } catch (error) {
      setSheet((current) =>
        current
          ? {
              ...current,
              authorizationInput: "",
              status: "授权失败：" + errorText(error),
            }
          : current,
      );
    } finally {
      setBusy(false);
    }
  }

  function cancelAuth() {
    if (!sheet) return;
    cancelProviderAuth(sheet.provider, sheet.profileId);
    setSheet(null);
    refresh();
  }

  // 设置页只保留账号维护与小组件设置；添加账号统一从状态页右上角进入。
  const toolbar = usePageToolbar();

  if (sheet) {
    return (
      <AuthSheetView
        authSheet={sheet}
        backgroundTheme={props.backgroundTheme}
        onChangeInput={(value) =>
          setSheet((current) =>
            current ? { ...current, authorizationInput: value } : current,
          )
        }
        onSubmit={submitAuth}
        onCancel={cancelAuth}
      />
    );
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
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
        toolbar={toolbar}
        navigationDestination={{
          isPresented: selectedDestination != null,
          onChanged: (value) => {
            if (!value) setSelectedDestination(null);
          },
          content:
            selectedDestination?.kind === "account" ? (
              <AccountDetailPage
                key={`${selectedDestination.provider}:${selectedDestination.account.id}`}
                provider={selectedDestination.provider}
                account={selectedDestination.account}
                demo={props.demoMode}
                backgroundTheme={props.backgroundTheme}
                onReauthorize={() =>
                  startAuth(
                    selectedDestination.provider,
                    selectedDestination.account.id,
                  )
                }
                onDelete={() => {
                  deleteAuthorizedAccount(
                    selectedDestination.provider,
                    selectedDestination.account.id,
                  );
                  requestWidgetReload();
                  setSelectedDestination(null);
                  refresh();
                }}
              />
            ) : selectedDestination?.kind === "log" ? (
              <LogPage backgroundTheme={props.backgroundTheme} />
            ) : selectedDestination?.kind === "changelog" ? (
              <ChangelogPage backgroundTheme={props.backgroundTheme} />
            ) : selectedDestination?.kind === "dashboard" ? (
              <DashboardPrefsPage
                backgroundTheme={props.backgroundTheme}
                demoMode={props.demoMode}
                onChanged={() => {
                  refresh();
                  props.onDashboardPrefsChange?.();
                }}
              />
            ) : selectedDestination?.kind === "widget-dashboard" ? (
              <DashboardPrefsPage
                backgroundTheme={props.backgroundTheme}
                demoMode={props.demoMode}
                scope="widget"
                onChanged={() => {
                  refresh();
                  requestWidgetReload();
                }}
              />
            ) : (
              <Text>选择项目</Text>
            ),
        }}
      >
        <Section
          listRowBackground={settingsRowBackground}
          header={<Text font="footnote" foregroundStyle="secondaryLabel">账号</Text>}
        >
          <SettingsGroup>
            {(() => {
              const allAccounts = PROVIDERS.flatMap((meta) => {
                const accounts = props.demoMode
                  ? listDemoAccounts(meta.id)
                  : listProviderAccounts(meta.id).filter((account) =>
                      isAuthorized(meta.id, account.id),
                    );
                return accounts.map((account) => ({ meta, account }));
              });

              if (allAccounts.length === 0) {
                return (
                  <HStack
                    padding={{ vertical: true }}
                    frame={{ minHeight: 44, maxWidth: "infinity" }}
                  >
                    <Text font={13} foregroundStyle="secondaryLabel">
                      尚未连接账号
                    </Text>
                    <Spacer />
                  </HStack>
                );
              }

              return allAccounts.map(({ meta, account }, index) => {
                const displayName =
                  account.email ||
                  (account.name &&
                  account.name !== account.id &&
                  !/^acct_/i.test(account.name)
                    ? account.name
                    : "未命名账号");
                return (
                  <VStack
                    key={`${meta.id}:${account.id}:${tick}`}
                    alignment="leading"
                    spacing={0}
                    frame={{ maxWidth: "infinity" }}
                  >
                    <Button
                      buttonStyle="plain"
                      frame={{ maxWidth: "infinity" }}
                      action={() =>
                        setSelectedDestination({
                          kind: "account",
                          provider: meta.id,
                          account,
                        })
                      }
                    >
                      <HStack
                        spacing={12}
                        padding={{ vertical: true }}
                        frame={{ minHeight: 44, maxWidth: "infinity" }}
                        contentShape="rect"
                      >
                        <ProviderLogo provider={meta.id} size={20} />
                        <VStack alignment="leading" spacing={2}>
                          <Text font="body">{meta.title}</Text>
                          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1} truncationMode="tail">
                            {displayName}
                          </Text>
                        </VStack>
                        <Spacer />
                        <Image
                          systemName="chevron.right"
                          imageScale="small"
                          foregroundStyle="tertiaryLabel"
                        />
                      </HStack>
                    </Button>
                    {index < allAccounts.length - 1 ? <CardDivider /> : null}
                  </VStack>
                );
              });
            })()}
          </SettingsGroup>
        </Section>

        <Section
          listRowBackground={settingsRowBackground}
          header={<Text font="footnote" foregroundStyle="secondaryLabel">显示</Text>}
          footer={
            <Text font="caption" foregroundStyle="secondaryLabel">
              {APP_DASHBOARD_SETTINGS_FOOTER}
            </Text>
          }
        >
          <SettingsGroup>
            <Picker
              title="背景主题"
              value={props.backgroundTheme}
              onChanged={(value: string) => {
                props.onBackgroundThemeChange(value as BackgroundThemeId);
                refresh();
              }}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              {BACKGROUND_THEMES.map((theme) => (
                <Text key={theme.id} tag={theme.id}>
                  {theme.title}
                </Text>
              ))}
            </Picker>
            <CardDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => setSelectedDestination({ kind: "dashboard" })}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>应用内用量内容</Text>
                <Spacer />
                <Image
                  systemName="chevron.right"
                  imageScale="small"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
          </SettingsGroup>
        </Section>

        <Section
          listRowBackground={settingsRowBackground}
          header={<Text font="footnote" foregroundStyle="secondaryLabel">桌面小组件</Text>}
          footer={
            <Text font="caption" foregroundStyle="secondaryLabel">
              {WIDGET_DASHBOARD_SETTINGS_FOOTER}
            </Text>
          }
        >
          <SettingsGroup>
            <Picker
              title="刷新间隔"
              value={String(snapReloadMinutes(settings.reloadMinutes))}
              onChanged={(value: string) => {
                setAppReloadMinutes(Number(value));
                requestWidgetReload();
                refresh();
              }}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              <Text tag="5">5 分钟</Text>
              <Text tag="10">10 分钟</Text>
              <Text tag="15">15 分钟</Text>
              <Text tag="30">30 分钟</Text>
              <Text tag="60">60 分钟</Text>
            </Picker>
            <CardDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => setSelectedDestination({ kind: "widget-dashboard" })}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>桌面小组件内容</Text>
                <Spacer />
                <Image
                  systemName="chevron.right"
                  imageScale="small"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
            <CardDivider />
            <Picker
              title="预览桌面小组件"
              value={dashboardPreviewFamily}
              onChanged={(value: string) => {
                if (
                  value !== "systemSmall" &&
                  value !== "systemMedium" &&
                  value !== "systemLarge"
                ) {
                  return;
                }
                setDashboardPreviewFamily(value);
                void previewDashboardWidget(value).finally(() => {
                  setDashboardPreviewFamily("choose");
                });
              }}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              <Text tag="choose">选择尺寸</Text>
              <Text tag="systemSmall">小号小组件</Text>
              <Text tag="systemMedium">中号小组件</Text>
              <Text tag="systemLarge">大号小组件</Text>
            </Picker>
            <CardDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={async () => {
                await Pasteboard.setString(WIDGET_DASHBOARD_PARAMETER);
                await Dialog.alert({
                  title: "已复制小组件参数",
                  message:
                    "请长按主屏幕上的 AI Usage 小组件并选择“编辑小组件”，将内容粘贴到“参数”。参数为 dashboard 时将显示多账号用量。",
                  buttonLabel: "知道了",
                });
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text foregroundStyle="accentColor">复制小组件参数</Text>
                <Spacer />
              </HStack>
            </Button>
            <CardDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => {
                void reloadHomeScreenWidgets();
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text foregroundStyle="accentColor">刷新桌面小组件</Text>
                <Spacer />
              </HStack>
            </Button>
          </SettingsGroup>
        </Section>

        <Section
          listRowBackground={settingsRowBackground}
          header={<Text font="footnote" foregroundStyle="secondaryLabel">高级与支持</Text>}
        >
          <SettingsGroup>
            <Toggle
              title="演示模式"
              value={props.demoMode}
              onChanged={(value: boolean) => {
                props.onDemoModeChange(value);
                refresh();
              }}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
            <CardDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => setSelectedDestination({ kind: "log" })}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>运行记录</Text>
                <Spacer />
                <Image
                  systemName="chevron.right"
                  imageScale="small"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
            <CardDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => setSelectedDestination({ kind: "changelog" })}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>版本信息</Text>
                <Spacer />
                <Text foregroundStyle="secondaryLabel">{CURRENT_VERSION}</Text>
                <Image
                  systemName="chevron.right"
                  imageScale="small"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
          </SettingsGroup>
        </Section>
      </List>
    </NavigationStack>
  );
}
