import { AuthorizationCheckDeferred } from "../services/auth-single-check";
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
import {
  isAuthorizationCancelledError,
  isAuthorizationInputRejectedError,
} from "../services/auth-errors";
import { PROVIDERS, type ProviderId } from "../models";
import { parseConsoleAuthChoice } from "../providers/console-auth-choice";
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
  setWidgetChromeStyle,
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
import { requestWidgetReloadAfterStorage } from "../services/widgets";
import {
  isAccountShownInOverview,
  setAccountShownInOverview,
} from "../services/app-overview-prefs";
import {
  runBackupExportFlow,
  runBackupImportFlow,
} from "../services/backup-service";

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
  onBackupRestored?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [sheet, setSheet] = useState<AuthSheet | null>(null);
  const [authView] = useState(() => ({
    revision: 0,
    active: true,
    running: false,
  }));
  useEffect(() => {
    authView.active = true;
    return () => {
      authView.active = false;
      authView.revision += 1;
    };
  }, []);
  const [selectedDestination, setSelectedDestination] =
    useState<SelectedDestination | null>(null);
  const [busy, setBusy] = useState(false);
  const [dashboardParameterCopied, setDashboardParameterCopied] =
    useState(false);
  const settings = getAppDisplaySettings();
  const dashboardPreferences = getDashboardWidgetPreferences(
    props.demoMode ? "demo" : "live",
  );

  function refresh() {
    setTick((value) => value + 1);
  }

  useEffect(() => {
    if (props.demoMode || sheet) return;
    const pendingSheet = authCoordinator.resume();
    if (pendingSheet) setSheet(pendingSheet);
  }, [props.demoMode]);

  async function finishAuth(target: AuthSheet) {
    const revision = ++authView.revision;
    authView.running = true;
    const current = () =>
      authView.active &&
      revision === authView.revision &&
      authCoordinator.isCurrent(target);
    setBusy(true);
    setSheet({ ...target, status: "正在完成连接…" });
    try {
      await authCoordinator.complete(target);
      if (!current()) return;
      setSheet(null);
      requestWidgetReloadAfterStorage();
      refresh();
    } catch (error) {
      if (!current() || isAuthorizationCancelledError(error)) return;
      setSheet({
        ...target,
        authorizationInput: "",
        status:
          error instanceof AuthorizationCheckDeferred
            ? "授权待继续：" + error.message
            : isAuthorizationInputRejectedError(error)
              ? "授权输入有误：" + error.message
              : "授权失败：" + errorText(error),
      });
    } finally {
      if (authView.active && revision === authView.revision) {
        authView.running = false;
        setBusy(false);
      }
    }
  }

  async function startAuth(
    provider: ProviderId,
    profileId?: string,
    restartSheet?: AuthSheet,
  ) {
    if (busy || authView.running) return;
    const revision = ++authView.revision;
    authView.running = true;
    const current = () => authView.active && revision === authView.revision;
    setBusy(true);
    try {
      const pendingSheet = restartSheet ? null : authCoordinator.resume();
      if (pendingSheet) {
        setSheet(pendingSheet);
        if (
          pendingSheet.autoComplete &&
          !pendingSheet.deviceCode &&
          pendingSheet.authorizationPageOpened !== false
        )
          await finishAuth(pendingSheet);
        return;
      }
      const consoleRegion =
        provider === "minimax" || provider === "zai"
          ? parseConsoleAuthChoice(
              (await Dialog.actionSheet({
                title:
                  provider === "minimax"
                    ? "选择 MiniMax 站点"
                    : "选择 Z.ai 站点",
                message:
                  provider === "minimax"
                    ? "Subscription Key 必须从对应站点获取；稍后仍会用真实额度行校验区域。"
                    : "API Key 必须从对应控制台获取；稍后仍会自动校验国际站或国内站。",
                actions:
                  provider === "minimax"
                    ? [
                        { label: "国际站 · minimax.io" },
                        { label: "国内站 · minimaxi.com" },
                      ]
                    : [
                        { label: "国际站 · Z.ai" },
                        { label: "国内站 · 智谱开放平台" },
                      ],
                cancelButton: true,
              })) ?? -1,
            )
          : null;
      if (!current()) return;
      if ((provider === "minimax" || provider === "zai") && !consoleRegion)
        return;
      const result = restartSheet
        ? await authCoordinator.restart(
            restartSheet,
            consoleRegion || undefined,
          )
        : await authCoordinator.start({
            provider,
            profileId,
            providerInput: consoleRegion || undefined,
          });
      if (!current()) {
        if (result.ok) authCoordinator.cancel(result.sheet);
        return;
      }
      if (result.ok) {
        setSheet(result.sheet);
        if (
          result.sheet.autoComplete &&
          !result.sheet.deviceCode &&
          result.sheet.authorizationPageOpened !== false
        )
          await finishAuth(result.sheet);
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
      if (authView.active && revision === authView.revision) {
        authView.running = false;
        setBusy(false);
      }
    }
  }

  async function submitAuth(authorizationInput?: string) {
    if (!sheet || busy || authView.running) return;
    const target =
      authorizationInput === undefined
        ? sheet
        : { ...sheet, authorizationInput };
    if (authorizationInput !== undefined) setSheet(target);
    await finishAuth(target);
  }

  function cancelAuth() {
    if (!sheet) return;
    authView.revision += 1;
    authView.running = false;
    setBusy(false);
    try {
      authCoordinator.cancel(sheet);
      setSheet(null);
      refresh();
    } catch (error) {
      if (isAuthorizationCancelledError(error)) {
        setSheet(null);
        refresh();
        return;
      }
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
        completing={busy}
        onChangeInput={(value) =>
          setSheet((current) =>
            current ? { ...current, authorizationInput: value } : current,
          )
        }
        onRestart={() => {
          void startAuth(sheet.provider, sheet.profileId, sheet);
        }}
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
        listRowSeparator="hidden"
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
                  requestWidgetReloadAfterStorage();
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
                dataSource={props.demoMode ? "demo" : "live"}
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
                const result = setDashboardWidgetDisplayPreferences(
                  { showAccountLabel: value },
                  props.demoMode ? "demo" : "live",
                );
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
                const parameter = props.demoMode
                  ? "dashboard:demo"
                  : "dashboard";
                await Pasteboard.setString(parameter);
                setDashboardParameterCopied(true);
                setTimeout(() => setDashboardParameterCopied(false), 1800);
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <VStack alignment="leading" spacing={2}>
                  <Text
                    font="caption"
                    foregroundStyle={
                      dashboardParameterCopied
                        ? "systemGreen"
                        : "secondaryLabel"
                    }
                  >
                    {dashboardParameterCopied
                      ? "小组件参数已复制到剪贴板"
                      : "小组件参数（点击复制）"}
                  </Text>
                  <Text font="subheadline" fontWeight="medium">
                    {props.demoMode ? "dashboard:demo" : "dashboard"}
                  </Text>
                </VStack>
                <Spacer />
                <Image
                  systemName="doc.on.doc"
                  imageScale="medium"
                  foregroundStyle="accentColor"
                />
              </HStack>
            </Button>
            <GlassDivider />
            <GlassNoteRow text="账号标识显示在套餐标签右侧，默认关闭以减少主屏幕隐私暴露。" />
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="外观" />}
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
              title="小组件风格"
              value={settings.widgetChromeStyle}
              onChanged={(value: string) => {
                const result = setWidgetChromeStyle(
                  value === "clear" ? "clear" : "color",
                );
                if (!result.ok) {
                  void showSettingsSaveFailure();
                  refresh();
                  return;
                }
                requestWidgetReloadAfterStorage();
                refresh();
              }}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              <Text tag="color">默认 (彩色)</Text>
              <Text tag="clear">Clear (简约)</Text>
            </Picker>
            <GlassDivider />
            <GlassNoteRow
              text={
                "• 默认（彩色）：专属彩色套餐徽章，进度条根据额度消耗动态切换色彩预警。\n• Clear（简约）：轻量无底色套餐徽章与镂空进度条；专为透明桌面适配，普通桌面上亦呈现通透简约质感。"
              }
            />
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="刷新" />}
        >
          <GlassGroup>
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
                requestWidgetReloadAfterStorage();
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
          header={<GlassSectionHeader title="数据与备份" />}
        >
          <GlassGroup>
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => {
                void runBackupExportFlow();
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>导出加密备份文件</Text>
                <Spacer />
                <Image
                  systemName="square.and.arrow.up"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
            <GlassDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => {
                void runBackupImportFlow(() => {
                  refresh();
                  props.onOverviewChange();
                  props.onBackupRestored?.();
                });
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>从备份文件恢复</Text>
                <Spacer />
                <Image
                  systemName="square.and.arrow.down"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
            <GlassDivider />
            <GlassNoteRow text="备份包含所有已授权账号凭据及小组件偏好。采用 AES-GCM 256 强加密，请牢记设置的密码，密码丢失将无法恢复。" />
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
