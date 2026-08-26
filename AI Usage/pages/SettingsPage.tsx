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
  useState,
} from "scripting";
import { PROVIDERS, type ProviderId } from "../models";
import {
  cancelProviderAuth,
  completeProviderAuth,
  deleteAuthorizedAccount,
  isAuthorized,
  listProviderAccounts,
} from "../services/hub";
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

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

type SelectedDestination =
  | {
      kind: "account";
      provider: ProviderId;
      account: { id: string; name: string; email: string | null };
    }
  | { kind: "log" }
  | { kind: "changelog" }
  | { kind: "dashboard" };

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
  const settings = getAppDisplaySettings();

  function refresh() {
    setTick((value) => value + 1);
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
            ) : (
              <Text>选择项目</Text>
            ),
        }}
      >
        <Section
          listRowBackground={settingsRowBackground}
          header={<Text foregroundStyle="secondaryLabel">演示</Text>}
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
          </SettingsGroup>
        </Section>

        {PROVIDERS.map((meta) => {
          const accounts = props.demoMode
            ? listDemoAccounts(meta.id)
            : listProviderAccounts(meta.id).filter((account) =>
                isAuthorized(meta.id, account.id),
              );
          return (
            <Section
              key={meta.id}
              listRowBackground={settingsRowBackground}
              header={
                meta.id === "codex" ? (
                  <Text foregroundStyle="secondaryLabel">账号</Text>
                ) : undefined
              }
            >
              <SettingsGroup>
                <HStack
                  spacing={8}
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                >
                  <ProviderLogo provider={meta.id} size={18} />
                  <Text fontWeight="semibold">{meta.title}</Text>
                  <Spacer />
                </HStack>
                <CardDivider />
                {accounts.length > 0 ? (
                  accounts.map((account, index) => (
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
                          padding={{ vertical: true }}
                          frame={{ minHeight: 44, maxWidth: "infinity" }}
                          contentShape="rect"
                        >
                          <Text font="body" lineLimit={1} truncationMode="tail">
                            {account.email ||
                              (account.name &&
                              account.name !== account.id &&
                              !/^acct_/i.test(account.name)
                                ? account.name
                                : "未命名账号")}
                          </Text>
                          <Spacer />
                          <Image
                            systemName="chevron.right"
                            foregroundStyle="tertiaryLabel"
                          />
                        </HStack>
                      </Button>
                      {index < accounts.length - 1 ? <CardDivider /> : null}
                    </VStack>
                  ))
                ) : (
                  <HStack
                    padding={{ vertical: true }}
                    frame={{ minHeight: 44, maxWidth: "infinity" }}
                  >
                    <Text font={13} foregroundStyle="secondaryLabel">
                      尚未连接账号
                    </Text>
                    <Spacer />
                  </HStack>
                )}
              </SettingsGroup>
            </Section>
          );
        })}

        <Section
          listRowBackground={settingsRowBackground}
          header={<Text foregroundStyle="secondaryLabel">显示</Text>}
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
            <Picker
              title="刷新间隔"
              value={String(settings.reloadMinutes)}
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
          </SettingsGroup>
        </Section>

        <Section
          listRowBackground={settingsRowBackground}
          header={<Text foregroundStyle="secondaryLabel">用量总览</Text>}
          footer={
            <Text font="caption" foregroundStyle="secondaryLabel">
              选择用量页要展示的账号与额度条目（5 小时 / 周限等）。
            </Text>
          }
        >
          <SettingsGroup>
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
                <Text>选择展示内容</Text>
                <Spacer />
                <Image
                  systemName="chevron.right"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
          </SettingsGroup>
        </Section>

        <Section
          listRowBackground={settingsRowBackground}
          header={<Text foregroundStyle="secondaryLabel">运行与支持</Text>}
        >
          <SettingsGroup>
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
