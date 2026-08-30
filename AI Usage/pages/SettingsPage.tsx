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
  useState,
} from "scripting";
import { PROVIDERS, type ProviderId } from "../models";
import { parseMinimaxAuthChoice } from "../providers/minimax/auth-choice";
import {
  beginProviderAuth,
  cachedPlanLabel,
  cachedUsageWindows,
  cancelProviderAuth,
  completeProviderAuth,
  deleteAuthorizedAccount,
  isAuthorized,
  listAuthorizedCards,
  listProviderAccounts,
} from "../services/hub";
import {
  BACKGROUND_THEMES,
  getAppDisplaySettings,
  setAppReloadMinutes,
  type BackgroundThemeId,
} from "../services/settings";
import { openAuthorizationPage } from "../services/browser";
import { getPendingAuthorizationState } from "../providers/copilot/oauth";
import { planCopilotAuthorization } from "../providers/copilot/auth-flow";
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
  onDemoModeChange: (enabled: boolean) => void;
  onBackgroundThemeChange: (theme: BackgroundThemeId) => void;
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

  async function startAuth(provider: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
    let activeProfileId = profileId || provider;
    try {
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
      const started = await beginProviderAuth(
        provider,
        profileId,
        minimaxRegion || undefined,
      );
      activeProfileId = started.profileId;
      if (provider === "copilot") {
        const state = getPendingAuthorizationState();
        if (!state) throw new Error("GitHub 设备码生成失败，请重新开始");
        const plan = planCopilotAuthorization(state);
        setSheet({
          provider,
          profileId: plan.profileId,
          authorizationInput: "",
          deviceCode: plan.deviceCode,
          status: plan.status,
        });
        return;
      }
      // 其他平台保持原流程：先打开授权页，关闭后再进入粘贴页。
      const mode = await openAuthorizationPage(started.url);
      setSheet({
        provider,
        profileId: started.profileId,
        authorizationInput: "",
        status:
          provider === "minimax"
            ? mode === "present"
              ? `关闭 ${minimaxRegion === "cn" ? "国内站" : "国际站"}控制台后，粘贴 Subscription Key`
              : `已打开 MiniMax ${minimaxRegion === "cn" ? "国内站" : "国际站"}控制台，复制 Subscription Key 后粘贴`
            : provider === "zai"
              ? mode === "present"
                ? "关闭控制台后，把 API Key 粘贴到下方并提交"
                : "已打开 API Key 控制台，复制 Key 后粘贴到下方并提交"
              : mode === "present"
                ? "关闭授权页后，把回调地址或授权码粘贴到下方"
                : "已在系统 Safari 打开授权页，完成后把回调地址或授权码粘贴到下方",
      });
    } catch (error) {
      setSheet({
        provider,
        profileId: activeProfileId,
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
                  deleteAuthorizedAccount(
                    selectedDestination.provider,
                    selectedDestination.account.id,
                  );
                  requestWidgetReload();
                  setSelectedDestination(null);
                  refresh();
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
                          setAccountShownInOverview(meta.id, account.id, value);
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
                setDashboardWidgetDisplayPreferences({
                  showAccountLabel: value,
                });
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
