import {
  Button,
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
  useEffect,
  useState,
} from "scripting";
import { PROVIDERS, type ProviderId } from "../models";
import { parseMinimaxAuthChoice } from "../providers/minimax/auth-choice";
import {
  authCoordinator,
  cachedPlanLabel,
  cachedUsageWindows,
  deleteAuthorizedAccount,
  isAuthorized,
  listAuthorizedCards,
  listProviderAccounts,
} from "../services/hub";
import {
  BACKGROUND_THEMES,
  getAppDisplaySettings,
  RELOAD_MINUTE_LABELS,
  RELOAD_MINUTE_OPTIONS,
  setAppReloadMinutes,
  snapReloadMinutes,
  type BackgroundThemeId,
} from "../services/settings";
import {
  GlassDivider,
  GlassGroup,
  GlassNoteRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/GlassList";
import { AuthSheetView } from "../components/AuthSheetView";
import { PageBackground } from "../components/PageBackground";
import { ProviderLogo } from "../components/ProviderLogo";
import { usePageToolbar } from "../components/PageToolbar";
import { CURRENT_VERSION } from "../changelog";
import { ChangelogPage } from "./ChangelogPage";
import { AccountDetailPage } from "./AccountDetailPage";
import { DashboardWidgetSettingsPage } from "./DashboardWidgetSettingsPage";
import { LogPage } from "./LogPage";
import type { AuthSheet } from "../models";
import { listDemoAccounts, listDemoCards } from "../services/demo";
import {
  getDashboardWidgetPreferences,
  setDashboardWidgetDisplayPreferences,
} from "../services/dashboard-widget-prefs";
import {
  requestWidgetReload,
  requestWidgetReloadAfterStorage,
} from "../services/widgets";
import {
  isAccountShownInOverview,
  setAccountShownInOverview,
} from "../services/app-overview-prefs";

export async function showSettingsSaveFailure(): Promise<void> {
  await Dialog.alert({
    title: "设置未保存",
    message: "无法写入本地设置，请稍后重试。",
    buttonLabel: "关闭",
  });
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

type SelectedDestination =
  | {
      kind: "account";
      provider: ProviderId;
      account: {
        id: string;
        name: string;
        email: string | null;
        planLabel?: string | null;
      };
    }
  | { kind: "dashboardWidget" }
  | { kind: "log" }
  | { kind: "changelog" };

export function SettingsPage(props: {
  demoMode: boolean;
  backgroundTheme: BackgroundThemeId;
  onDemoModeChange: (enabled: boolean) => void | Promise<void>;
  onBackgroundThemeChange: (theme: BackgroundThemeId) => void | Promise<void>;
  onOverviewChange: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [sheet, setSheet] = useState<AuthSheet | null>(null);
  const [selectedDestination, setSelectedDestination] =
    useState<SelectedDestination | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = getAppDisplaySettings();
  const dashboardPreferences = getDashboardWidgetPreferences();

  function refresh() {
    setTick((value) => value + 1);
  }

  useEffect(() => {
    if (props.demoMode || sheet) return;
    const pendingSheet = authCoordinator.resume();
    if (pendingSheet) setSheet(pendingSheet);
  }, [props.demoMode]);

  async function startAuth(provider: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const pendingSheet = authCoordinator.resume();
      if (pendingSheet) {
        setSheet(pendingSheet);
        return;
      }
      const minimaxRegion =
        provider === "minimax"
          ? parseMinimaxAuthChoice(
              (await Dialog.actionSheet({
                title: "选择 MiniMax 站点",
                message:
                  "Subscription Key 必须从对应站点获取；稍后仍会用真实额度行校验区域。",
                actions: [
                  { label: "国际站 · minimax.io" },
                  { label: "国内站 · minimaxi.com" },
                ],
                cancelButton: true,
              })) ?? -1,
            )
          : null;
      if (provider === "minimax" && !minimaxRegion) return;
      const result = await authCoordinator.start({
        provider,
        profileId,
        providerInput: minimaxRegion || undefined,
      });
      if (result.ok) {
        setSheet(result.sheet);
        return;
      }
      if (result.sheet) setSheet(result.sheet);
      else {
        await Dialog.alert({
          title: "无法开始授权",
          message: result.message,
          buttonLabel: "关闭",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth() {
    if (!sheet || busy) return;
    setBusy(true);
    try {
      setSheet({ ...sheet, status: "正在验证授权…" });
      await authCoordinator.complete(sheet);
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
    try {
      authCoordinator.cancel(sheet);
      setSheet(null);
      refresh();
    } catch (error) {
      setSheet({
        ...sheet,
        status: "取消授权失败：" + errorText(error),
      });
    }
  }

  // 设置页只保留账号维护与小组件设置；添加账号统一从状态页右上角进入。
  const toolbar = usePageToolbar();
  const accountRows = PROVIDERS.flatMap((meta) => {
    const accounts = props.demoMode
      ? listDemoAccounts(meta.id)
      : listProviderAccounts(meta.id).filter((account) =>
          isAuthorized(meta.id, account.id),
        );
    return accounts.map((account) => ({ meta, account }));
  });

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
                overviewWindows={cachedUsageWindows(
                  selectedDestination.provider,
                  selectedDestination.account.id,
                )}
                onOverviewChange={props.onOverviewChange}
                demo={props.demoMode}
                backgroundTheme={props.backgroundTheme}
                onReauthorize={() =>
                  startAuth(
                    selectedDestination.provider,
                    selectedDestination.account.id,
                  )
                }
                onDelete={() => {
                  const result = deleteAuthorizedAccount(
                    selectedDestination.provider,
                    selectedDestination.account.id,
                  );
                  requestWidgetReload();
                  setSelectedDestination(null);
                  refresh();
                  if (
                    result.pendingSecretCleanup ||
                    result.pendingPreferenceCleanup
                  ) {
                    void Dialog.alert({
                      title: "账号已删除",
                      message: result.pendingSecretCleanup
                        ? "账号已从 AI Usage 移除，剩余 Keychain 清理将在下次启动时自动重试。"
                        : "账号已删除，但部分小组件或显示偏好未能清理。",
                      buttonLabel: "关闭",
                    });
                  }
                }}
              />
            ) : selectedDestination?.kind === "dashboardWidget" ? (
              <DashboardWidgetSettingsPage
                cards={props.demoMode ? listDemoCards() : listAuthorizedCards()}
                backgroundTheme={props.backgroundTheme}
              />
            ) : selectedDestination?.kind === "log" ? (
              <LogPage backgroundTheme={props.backgroundTheme} />
            ) : selectedDestination?.kind === "changelog" ? (
              <ChangelogPage backgroundTheme={props.backgroundTheme} />
            ) : (
              <Text>选择项目</Text>
            ),
        }}
      >
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="演示" />}
        >
          <GlassGroup>
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
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="账号" />}
        >
          <GlassGroup>
            {accountRows.length > 0 ? (
              accountRows.map(({ meta, account }, index) => {
                const title = account.email || account.name;
                const planLabel =
                  "planLabel" in account
                    ? account.planLabel
                    : cachedPlanLabel(meta.id, account.id);
                const shown = isAccountShownInOverview(meta.id, account.id);
                return (
                  <VStack
                    key={`${meta.id}:${account.id}:${tick}`}
                    alignment="leading"
                    spacing={0}
                    frame={{ maxWidth: "infinity" }}
                  >
                    <HStack
                      alignment="center"
                      spacing={12}
                      padding={{ vertical: true }}
                      frame={{ minHeight: 56, maxWidth: "infinity" }}
                    >
                      <Button
                        buttonStyle="plain"
                        frame={{ maxWidth: "infinity" }}
                        action={() =>
                          setSelectedDestination({
                            kind: "account",
                            provider: meta.id,
                            account: {
                              id: account.id,
                              name: account.name,
                              email: account.email,
                              planLabel,
                            },
                          })
                        }
                      >
                        <HStack
                          spacing={10}
                          frame={{ maxWidth: "infinity" }}
                          contentShape="rect"
                        >
                          <ProviderLogo provider={meta.id} size={24} />
                          <VStack alignment="leading" spacing={3}>
                            <Text
                              font="body"
                              lineLimit={1}
                              truncationMode="tail"
                            >
                              {title}
                            </Text>
                            <Text
                              font={13}
                              foregroundStyle="secondaryLabel"
                              lineLimit={1}
                              truncationMode="tail"
                            >
                              {planLabel && planLabel !== meta.title
                                ? `${meta.title} · ${planLabel}`
                                : meta.title}
                            </Text>
                          </VStack>
                          <Spacer />
                        </HStack>
                      </Button>
                      <Toggle
                        title={`在用量总览中显示 ${title}`}
                        labelsHidden
                        toggleStyle="switch"
                        value={shown}
                        onChanged={(value: boolean) => {
                          if (
                            !setAccountShownInOverview(
                              meta.id,
                              account.id,
                              value,
                            )
                          ) {
                            void showSettingsSaveFailure();
                            refresh();
                            return;
                          }
                          props.onOverviewChange();
                          refresh();
                        }}
                      />
                    </HStack>
                    {index < accountRows.length - 1 ? <GlassDivider /> : null}
                  </VStack>
                );
              })
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
            <GlassDivider />
            <GlassNoteRow text="账号开关仅控制是否在 App 用量页显示，不影响单账号或多账号桌面小组件。" />
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="多账号小组件" />}
        >
          <GlassGroup>
            <Toggle
              title="显示账号标识"
              value={dashboardPreferences.display.showAccountLabel}
              onChanged={(value: boolean) => {
                const result = setDashboardWidgetDisplayPreferences({
                  showAccountLabel: value,
                });
                if (!result.ok) {
                  void showSettingsSaveFailure();
                  refresh();
                  return;
                }
                requestWidgetReloadAfterStorage();
                refresh();
              }}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
            <GlassDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => setSelectedDestination({ kind: "dashboardWidget" })}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>账号配置</Text>
                <Spacer />
                <Image
                  systemName="chevron.right"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
            <GlassDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={async () => {
                await Pasteboard.setString("dashboard");
                await Dialog.alert({
                  title: "已复制小组件参数",
                  message:
                    "添加 AI Usage 小组件后，将参数粘贴为 dashboard。只影响多账号桌面小组件。",
                  buttonLabel: "知道了",
                });
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text foregroundStyle="accentColor">复制参数</Text>
                <Spacer />
              </HStack>
            </Button>
            <GlassDivider />
            <GlassNoteRow text="账号标识显示在套餐标签右侧，默认关闭以减少主屏幕隐私暴露。" />
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="外观与刷新" />}
        >
          <GlassGroup>
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
            <GlassDivider />
            <Picker
              title="刷新间隔"
              value={String(snapReloadMinutes(settings.reloadMinutes))}
              onChanged={(value: string) => {
                const result = setAppReloadMinutes(Number(value));
                if (!result.ok) {
                  void showSettingsSaveFailure();
                  refresh();
                  return;
                }
                requestWidgetReload();
                refresh();
              }}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              {RELOAD_MINUTE_OPTIONS.map((minutes) => (
                <Text key={minutes} tag={String(minutes)}>
                  {RELOAD_MINUTE_LABELS[minutes]}
                </Text>
              ))}
            </Picker>
            <GlassDivider />
            <GlassNoteRow text="控制 App 启动自动刷新与小组件自动联网最短间隔；选「手动」则仅下拉/点刷新时联网。系统实际调度小组件可能延后。" />
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="关于" />}
        >
          <GlassGroup>
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
            <GlassDivider />
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
          </GlassGroup>
        </Section>
      </List>
    </NavigationStack>
  );
}
