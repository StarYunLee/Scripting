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
  Widget,
  useState,
} from "scripting";
import { PROVIDERS, type ProviderId } from "../models";
import { parseMinimaxAuthChoice } from "../providers/minimax/auth-choice";
import {
  beginProviderAuth,
  cachedPlanLabel,
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
import { openAuthorizationPage } from "../services/browser";
import {
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/GlassList";
import { getPendingAuthorizationState } from "../providers/copilot/oauth";
import { planCopilotAuthorization } from "../providers/copilot/auth-flow";
import { AuthSheetView } from "../components/AuthSheetView";
import { PageBackground } from "../components/PageBackground";
import { ProviderLogo } from "../components/ProviderLogo";
import { usePageToolbar } from "../components/PageToolbar";
import { CURRENT_VERSION } from "../changelog";
import { ChangelogPage } from "./ChangelogPage";
import { AccountDetailPage } from "./AccountDetailPage";
import { LogPage } from "./LogPage";
import { DashboardPrefsPage } from "./DashboardPrefsPage";
import type { AuthSheet } from "../models";
import { listDemoAccounts } from "../services/demo";
import { requestWidgetReload } from "../services/widgets";
import { WIDGET_DASHBOARD_PARAMETER } from "../widget/parameter";

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
  | { kind: "log" }
  | { kind: "changelog" }
  | { kind: "dashboard" }
  | { kind: "widget-dashboard" };

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

  async function startAuth(provider: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
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

  async function previewDashboardWidget(
    family: "systemSmall" | "systemMedium" | "systemLarge" | "systemExtraLarge",
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

        {PROVIDERS.map((meta) => {
          const accounts = props.demoMode
            ? listDemoAccounts(meta.id)
            : listProviderAccounts(meta.id).filter((account) =>
                isAuthorized(meta.id, account.id),
              );
          return (
            <Section
              key={meta.id}
              listRowBackground={glassRowBackground}
              header={
                meta.id === "codex" ? (
                  <GlassSectionHeader title="账号" />
                ) : undefined
              }
            >
              <GlassGroup>
                <HStack
                  spacing={8}
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                >
                  <ProviderLogo provider={meta.id} size={18} />
                  <Text fontWeight="semibold">{meta.title}</Text>
                  <Spacer />
                  <Text font={13} foregroundStyle="secondaryLabel">
                    {accounts.length}个账号
                  </Text>
                </HStack>
                <GlassDivider />
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
                            account: {
                              id: account.id,
                              name: account.name,
                              email: account.email,
                              planLabel:
                                "planLabel" in account
                                  ? account.planLabel
                                  : cachedPlanLabel(meta.id, account.id),
                            },
                          })
                        }
                      >
                        <HStack
                          padding={{ vertical: true }}
                          frame={{ minHeight: 44, maxWidth: "infinity" }}
                          contentShape="rect"
                        >
                          <Text font="body" lineLimit={1} truncationMode="tail">
                            {account.email || account.name}
                          </Text>
                          <Spacer />
                          <Image
                            systemName="chevron.right"
                            foregroundStyle="tertiaryLabel"
                          />
                        </HStack>
                      </Button>
                      {index < accounts.length - 1 ? <GlassDivider /> : null}
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
              </GlassGroup>
            </Section>
          );
        })}

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="显示" />}
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
          header={<GlassSectionHeader title="用量总览" />}
        >
          <GlassGroup>
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
            <GlassDivider />
            <Text
              font="caption"
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
            >
              选择用量页要展示的账号与用量窗口（5 小时 / 周限等）。
            </Text>
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="小组件总览" />}
        >
          <GlassGroup>
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() =>
                setSelectedDestination({ kind: "widget-dashboard" })
              }
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text>选择展示内容与隐私</Text>
                <Spacer />
                <Image
                  systemName="chevron.right"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            </Button>
            <GlassDivider />
            <Picker
              title="预览小组件"
              value="choose"
              onChanged={(value: string) => {
                if (value !== "choose") {
                  void previewDashboardWidget(
                    value as
                      | "systemSmall"
                      | "systemMedium"
                      | "systemLarge"
                      | "systemExtraLarge",
                  );
                }
              }}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              <Text tag="choose">选择尺寸</Text>
              <Text tag="systemSmall">Small</Text>
              <Text tag="systemMedium">Medium</Text>
              <Text tag="systemLarge">Large</Text>
              <Text tag="systemExtraLarge">Extra Large</Text>
            </Picker>
            <GlassDivider />
            <Text
              font="caption"
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
            >
              将小组件参数设为 dashboard，即可显示多账号总览；四种尺寸均可预览。
            </Text>
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="运行与支持" />}
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
