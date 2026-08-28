import { List, NavigationStack, Text, useEffect, useState } from "scripting";
import { AccountDetailPage } from "./AccountDetailPage";
import {
  beginProviderAuth,
  cancelProviderAuth,
  completeProviderAuth,
  deleteAuthorizedAccount,
  findPendingAuth,
  buildCard,
  listAuthorizedCards,
  listAllAuthorizedCards,
  listProviderAccounts,
  refreshCard,
} from "../services/hub";
import { demoAccountCount, refreshDemoCard } from "../services/demo";
import { writeLog } from "../services/logger";
import { AuthSheetView } from "../components/AuthSheetView";
import { ConnectEmptyView } from "../components/ConnectEmptyView";
import { PageBackground } from "../components/PageBackground";
import { usePageToolbar } from "../components/PageToolbar";
import { UsageCardView } from "../components/UsageCardView";
import { type AuthSheet, type ProviderId, type UsageCard } from "../models";
import { parseMinimaxAuthChoice } from "../providers/minimax/auth-choice";
import { openAuthorizationPage } from "../services/browser";
import { getPendingAuthorizationState } from "../providers/copilot/oauth";
import {
  planCopilotAuthorization,
  planPendingCopilotAuthorization,
} from "../providers/copilot/auth-flow";
import { refreshAccounts } from "../services/refresh";
import { selectAutoRefreshTargets } from "../services/refresh-policy";
import { requestWidgetReload } from "../services/widgets";
import {
  getAppDisplaySettings,
  type BackgroundThemeId,
} from "../services/settings";

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function StatusPage(props: {
  demoMode: boolean;
  backgroundTheme: BackgroundThemeId;
  dashboardEpoch?: number;
}) {
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [cards, setCards] = useState<UsageCard[]>(() => listAuthorizedCards());
  const [sheet, setSheet] = useState<AuthSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [openedCard, setOpenedCard] = useState<UsageCard | null>(null);
  const displayMode = "remaining";

  function setCardRefreshState(
    key: string,
    refreshing: boolean,
    refreshStatus?: "success" | "failure",
  ) {
    setCards((current) =>
      current.map((item) =>
        item.key === key ? { ...item, refreshing, refreshStatus } : item,
      ),
    );
  }

  function clearCardRefreshState(key: string) {
    setTimeout(() => {
      setCards((current) =>
        current.map((item) =>
          item.key === key ? { ...item, refreshStatus: undefined } : item,
        ),
      );
    }, 1600);
  }

  function reloadCards() {
    setCards(listAuthorizedCards());
  }

  useEffect(() => {
    reloadCards();
  }, [props.demoMode, props.dashboardEpoch]);

  useEffect(() => {
    if (props.demoMode) return;
    const pending = findPendingAuth();
    if (!pending) return;
    setProvider(pending.provider);
    const copilotState =
      pending.provider === "copilot" ? getPendingAuthorizationState() : null;
    const copilotPlan = copilotState
      ? planPendingCopilotAuthorization(copilotState)
      : null;
    setSheet({
      provider: pending.provider,
      profileId: pending.profileId,
      authorizationInput: "",
      deviceCode: copilotPlan?.deviceCode,
      status:
        copilotPlan?.status || "存在未完成的授权，请粘贴回调或授权码",
    });
  }, [props.demoMode]);

  useEffect(() => {
    const authorized = listAllAuthorizedCards();
    if (!authorized.length || props.demoMode) return;
    // 首帧直接用缓存渲染（cards 初值即来自 usage.cache）；
    // 后台只补「无缓存」或「缓存已超过全局 reloadMinutes」的账号，有界并发。
    const targets = selectAutoRefreshTargets(
      authorized.map((card) => ({
        provider: card.provider,
        profileId: card.accountId,
        fetchedAt: card.fetchedAt,
      })),
      {
        now: Date.now(),
        reloadMinutes: getAppDisplaySettings().reloadMinutes,
      },
    );
    if (!targets.length) return;
    let cancelled = false;
    (async () => {
      await refreshAccounts(
        targets.map((target) => ({
          provider: target.provider,
          profileId: target.profileId,
        })),
        { force: false, source: "app" },
        {
          onStart: (target) => {
            if (cancelled) return;
            setCardRefreshState(`${target.provider}:${target.profileId}`, true);
          },
          onResult: (outcome) => {
            if (cancelled) return;
            const key = `${outcome.provider}:${outcome.profileId}`;
            if (!outcome.ok) {
              setCardRefreshState(key, false, "failure");
              return;
            }
            const account = listProviderAccounts(outcome.provider).find(
              (item) => item.id === outcome.profileId,
            );
            if (!account) {
              setCardRefreshState(key, false, "failure");
              return;
            }
            const next = buildCard(outcome.provider, account, {
              source: outcome.source || "live",
            });
            setCards((current) =>
              current.map((item) => (item.key === key ? next : item)),
            );
            setCardRefreshState(key, false, "success");
          },
        },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [props.demoMode]);

  async function startAuth(target: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const minimaxRegion =
        target === "minimax"
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
      if (target === "minimax" && !minimaxRegion) return;
      const started = await beginProviderAuth(
        target,
        profileId,
        minimaxRegion || undefined,
      );
      if (target === "copilot") {
        const state = getPendingAuthorizationState();
        if (!state) throw new Error("GitHub 设备码生成失败，请重新开始");
        const plan = planCopilotAuthorization(state);
        setSheet({
          provider: target,
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
        provider: target,
        profileId: started.profileId,
        authorizationInput: "",
        status:
          target === "minimax"
            ? mode === "present"
              ? `关闭 ${minimaxRegion === "cn" ? "国内站" : "国际站"}控制台后，粘贴 Subscription Key`
              : `已打开 MiniMax ${minimaxRegion === "cn" ? "国内站" : "国际站"}控制台，复制 Subscription Key 后粘贴`
            : target === "zai"
              ? mode === "present"
                ? "关闭控制台后，把 API Key 粘贴到下方并提交"
                : "已打开 API Key 控制台，复制 Key 后粘贴到下方并提交"
              : mode === "present"
                ? "关闭授权页后，把回调地址或授权码粘贴到下方"
                : "已在系统 Safari 打开授权页，完成后把回调地址或授权码粘贴到下方",
      });
    } catch (error) {
      setSheet({
        provider: target,
        profileId: profileId || target,
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
      reloadCards();
      const next = await refreshCard(sheet.provider, sheet.profileId, true);
      setCards((current) => {
        const exists = current.some((item) => item.key === next.key);
        return exists
          ? current.map((item) => (item.key === next.key ? next : item))
          : [...current, next];
      });
      requestWidgetReload();
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
    reloadCards();
  }

  const toolbar = usePageToolbar({
    // 空态中心已有平台选择；有卡时才在右上继续添加。
    showAdd: cards.length > 0 || Boolean(sheet),
    onAdd: startAuth,
  });

  async function refreshAll() {
    if (busy) return;
    const targets = listAllAuthorizedCards();
    if (!targets.length) return;
    setBusy(true);
    if (props.demoMode) {
      const nextCards = targets.map((card) => refreshDemoCard(card.accountId));
      const visibleKeys = new Set(cards.map((card) => card.key));
      setCards(
        nextCards
          .filter((card) => visibleKeys.has(card.key))
          .map((card) => ({
            ...card,
            refreshStatus: "success" as const,
          })),
      );
      writeLog({
        level: "info",
        source: "app",
        category: "refresh",
        event: "refresh_all.completed",
        message: `全部刷新完成：成功 ${nextCards.length}，失败 0`,
      });
      await Dialog.alert({
        title: "刷新完成",
        message: `成功 ${nextCards.length} 个，失败 0 个。`,
        buttonLabel: "关闭",
      });
      for (const card of nextCards) clearCardRefreshState(card.key);
      requestWidgetReload();
      setBusy(false);
      return;
    }
    try {
      const summary = await refreshAccounts(
        targets.map((card) => ({
          provider: card.provider,
          profileId: card.accountId,
        })),
        { force: true, source: "app" },
        {
          onStart: (target) => {
            setCardRefreshState(`${target.provider}:${target.profileId}`, true);
          },
          onResult: (outcome) => {
            const account = listProviderAccounts(outcome.provider).find(
              (item) => item.id === outcome.profileId,
            );
            if (!account) return;
            const key = `${outcome.provider}:${outcome.profileId}`;
            const next = buildCard(outcome.provider, account, {
              errorMessage: outcome.error?.message,
              source: outcome.ok ? outcome.source || "live" : "error",
            });
            const refreshStatus = outcome.ok ? "success" : "failure";
            setCards((current) =>
              current.map((item) =>
                item.key === key
                  ? { ...next, refreshing: false, refreshStatus }
                  : item,
              ),
            );
            clearCardRefreshState(key);
          },
        },
      );
      writeLog({
        level: summary.failed ? "warning" : "info",
        source: "app",
        category: "refresh",
        event: "refresh_all.completed",
        message: `全部刷新完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
      });
      await Dialog.alert({
        title: summary.failed ? "刷新完成，部分失败" : "刷新成功",
        message: `成功 ${summary.succeeded} 个，失败 ${summary.failed} 个。`,
        buttonLabel: "关闭",
      });
    } finally {
      requestWidgetReload();
      setBusy(false);
    }
  }

  async function refreshOne(card: UsageCard) {
    if (card.refreshing || busy) return;
    setCardRefreshState(card.key, true);
    try {
      const next = await refreshCard(card.provider, card.accountId, true);
      const refreshStatus = next.source === "error" ? "failure" : "success";
      setCards((current) =>
        current.map((item) =>
          item.key === card.key
            ? { ...next, refreshing: false, refreshStatus }
            : item,
        ),
      );
      clearCardRefreshState(card.key);
      requestWidgetReload();
    } catch (error) {
      setCards((current) =>
        current.map((item) =>
          item.key === card.key
            ? {
                ...item,
                refreshing: false,
                refreshStatus: "failure",
                source: "error",
                errorMessage: errorText(error),
              }
            : item,
        ),
      );
      clearCardRefreshState(card.key);
    }
  }

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

  if (!cards.length) {
    const hasAccounts = listAllAuthorizedCards().length > 0;
    return (
      <NavigationStack>
        {hasAccounts ? (
          <List
            navigationTitle="用量"
            navigationBarTitleDisplayMode="inline"
            scrollContentBackground="hidden"
            listStyle="plain"
            background={<PageBackground theme={props.backgroundTheme} />}
            toolbar={toolbar}
          >
            <Text
              padding
              foregroundStyle="secondaryLabel"
              frame={{ maxWidth: "infinity", alignment: "center" }}
            >
              当前没有可展示的账号。请到「设置 → 用量总览」开启要显示的账号或用量窗口。
            </Text>
          </List>
        ) : (
          <ConnectEmptyView
            provider={provider}
            backgroundTheme={props.backgroundTheme}
            onSelectProvider={setProvider}
            onConnect={() => startAuth(provider)}
          />
        )}
      </NavigationStack>
    );
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="用量"
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        listStyle="plain"
        listRowSpacing={0}
        background={<PageBackground theme={props.backgroundTheme} />}
        toolbar={toolbar}
        refreshable={refreshAll}
        navigationDestination={{
          isPresented: openedCard != null,
          onChanged: (value) => {
            if (!value) setOpenedCard(null);
          },
          content: openedCard ? (
            <AccountDetailPage
              key={`${openedCard.provider}:${openedCard.accountId}:${openedCard.key}`}
              provider={openedCard.provider}
              account={{
                id: openedCard.accountId,
                name: openedCard.title,
                email: openedCard.title.includes("@") ? openedCard.title : null,
                planLabel: openedCard.planLabel,
              }}
              demo={props.demoMode}
              backgroundTheme={props.backgroundTheme}
              onReauthorize={() =>
                startAuth(openedCard.provider, openedCard.accountId)
              }
              onDelete={() => {
                deleteAuthorizedAccount(
                  openedCard.provider,
                  openedCard.accountId,
                );
                requestWidgetReload();
                setOpenedCard(null);
                reloadCards();
              }}
            />
          ) : (
            <Text>选择账号</Text>
          ),
        }}
      >
        {cards.map((card) => (
          <UsageCardView
            key={card.key}
            card={card}
            displayMode={displayMode}
            onRefresh={() => refreshOne(card)}
            onOpen={() => setOpenedCard(card)}
          />
        ))}
        <Text
          font={12}
          foregroundStyle="secondaryLabel"
          multilineTextAlignment="center"
          frame={{ maxWidth: "infinity" }}
          listRowBackground={<></>}
          listRowSeparator="hidden"
        >
          {props.demoMode
            ? `当前为演示模式，显示 ${demoAccountCount()} 个样例账号，不会请求真实接口。`
            : "只显示已授权账号；窗口以各平台实际返回为准。"}
        </Text>
      </List>
    </NavigationStack>
  );
}
