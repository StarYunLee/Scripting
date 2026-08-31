import { List, NavigationStack, Text, useEffect, useState } from "scripting";
import { AccountDetailPage } from "./AccountDetailPage";
import {
  authCoordinator,
  deleteAuthorizedAccount,
  buildCard,
  listAuthorizedCards,
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
import { refreshAccounts } from "../services/refresh";
import { requestWidgetReload } from "../services/widgets";
import {
  getAppDisplaySettings,
  type BackgroundThemeId,
} from "../services/settings";
import {
  applyOverviewPreferences,
  isAccountShownInOverview,
} from "../services/app-overview-prefs";

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function StatusPage(props: {
  demoMode: boolean;
  backgroundTheme: BackgroundThemeId;
  overviewRevision: number;
  onOverviewChange: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [cards, setCards] = useState<UsageCard[]>(() =>
    applyOverviewPreferences(listAuthorizedCards()),
  );
  const [sheet, setSheet] = useState<AuthSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [openedCard, setOpenedCard] = useState<UsageCard | null>(null);
  const displayMode = "remaining";
  const hasAccounts = listAuthorizedCards().length > 0;

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
    setCards(applyOverviewPreferences(listAuthorizedCards()));
  }

  useEffect(() => {
    reloadCards();
  }, [props.demoMode, props.overviewRevision]);

  useEffect(() => {
    if (props.demoMode) return;
    const pendingSheet = authCoordinator.resume();
    if (!pendingSheet) return;
    setProvider(pendingSheet.provider);
    setSheet(pendingSheet);
  }, [props.demoMode]);

  useEffect(() => {
    const authorized = listAuthorizedCards();
    if (!authorized.length || props.demoMode) return;
    // 启动刷新尊重用户设置的刷新间隔：缓存未超期的账号不发请求。
    // reloadMinutes === 0（手动）时启动完全跳过联网；下拉 refreshAll 不受限。
    // provider 内部的 MIN_LIVE_INTERVAL_MS 是防连点下限，这层闸门在它之上。
    const reloadMinutes = getAppDisplaySettings().reloadMinutes;
    if (reloadMinutes <= 0) return;
    const reloadMs = reloadMinutes * 60_000;
    const now = Date.now();
    const stale = authorized.filter((card) => {
      if (!card.fetchedAt) return true;
      const age = now - new Date(card.fetchedAt).getTime();
      return !Number.isFinite(age) || age >= reloadMs;
    });
    if (!stale.length) return;
    let cancelled = false;
    (async () => {
      const summary = await refreshAccounts(
        stale.map((card) => ({
          provider: card.provider,
          profileId: card.accountId,
        })),
        { force: false, source: "app" },
        {
          onResult: (outcome) => {
            if (cancelled || !outcome.ok) return;
            const account = listProviderAccounts(outcome.provider).find(
              (item) => item.id === outcome.profileId,
            );
            if (!account) return;
            const next = buildCard(outcome.provider, account, {
              source: outcome.source || "live",
            });
            const [visibleNext] = applyOverviewPreferences([next]);
            if (!visibleNext) return;
            setCards((current) =>
              current.map((item) =>
                item.key === visibleNext.key ? visibleNext : item,
              ),
            );
          },
        },
      );
      // 账号并发刷新完成后再发一次 reload 请求，避免逐账号顺序等待，
      // 也避免 Dashboard 缓存已更新但主屏幕仍持有旧时间线。
      if (!cancelled && summary.succeeded > 0) requestWidgetReload();
    })().catch(() => {
      /* 启动静默刷新失败时保留当前缓存和页面。 */
    });
    return () => {
      cancelled = true;
    };
  }, [props.demoMode]);

  async function startAuth(target: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const pendingSheet = authCoordinator.resume();
      if (pendingSheet) {
        setProvider(pendingSheet.provider);
        setSheet(pendingSheet);
        return;
      }
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
      const result = await authCoordinator.start({
        provider: target,
        profileId,
        providerInput: minimaxRegion || undefined,
      });
      if (result.ok) {
        setProvider(result.sheet.provider);
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
      reloadCards();
      const next = await refreshCard(sheet.provider, sheet.profileId, true);
      setCards((current) => {
        if (!isAccountShownInOverview(next.provider, next.accountId)) {
          return current;
        }
        const [visibleNext] = applyOverviewPreferences([next]);
        if (!visibleNext) return current;
        const exists = current.some((item) => item.key === visibleNext.key);
        return exists
          ? current.map((item) =>
              item.key === visibleNext.key ? visibleNext : item,
            )
          : [...current, visibleNext];
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
    try {
      authCoordinator.cancel(sheet);
      setSheet(null);
      reloadCards();
    } catch (error) {
      setSheet({
        ...sheet,
        status: "取消授权失败：" + errorText(error),
      });
    }
  }

  const toolbar = usePageToolbar({
    // 无账号空态中心已有平台选择；已有账号即使全部隐藏也保留添加入口。
    showAdd: hasAccounts || Boolean(sheet),
    onAdd: startAuth,
  });

  async function refreshAll() {
    if (busy) return;
    // Dashboard 的账号范围独立于 App 用量总览开关，不能只刷新当前
    // StatusPage 可见卡片；否则被 App 隐藏但在 Dashboard 显示的账号永远是旧缓存。
    const targets = listAuthorizedCards();
    if (!targets.length) return;
    setBusy(true);
    if (props.demoMode) {
      const nextCards = targets.map((card) => refreshDemoCard(card.accountId));
      setCards(
        nextCards
          .filter((card) =>
            isAccountShownInOverview(card.provider, card.accountId),
          )
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
      // 不要等用户关闭完成弹窗才刷新主屏幕组件。
      requestWidgetReload();
      await Dialog.alert({
        title: "刷新完成",
        message: `成功 ${nextCards.length} 个，失败 0 个。`,
        buttonLabel: "关闭",
      });
      for (const card of nextCards) clearCardRefreshState(card.key);
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
            const [visibleNext] = applyOverviewPreferences([next]);
            if (!visibleNext) return;
            const refreshStatus = outcome.ok ? "success" : "failure";
            setCards((current) =>
              current.map((item) =>
                item.key === key
                  ? { ...visibleNext, refreshing: false, refreshStatus }
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
      // 刷新完成即通知 WidgetKit，不把小组件更新绑定在弹窗关闭动作上。
      requestWidgetReload();
      await Dialog.alert({
        title: summary.failed ? "刷新完成，部分失败" : "刷新成功",
        message: `成功 ${summary.succeeded} 个，失败 ${summary.failed} 个。`,
        buttonLabel: "关闭",
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshOne(card: UsageCard) {
    if (card.refreshing || busy) return;
    setCardRefreshState(card.key, true);
    try {
      const next = await refreshCard(card.provider, card.accountId, true);
      const [visibleNext] = applyOverviewPreferences([next]);
      if (!visibleNext) return;
      const refreshStatus =
        visibleNext.source === "error" ? "failure" : "success";
      setCards((current) =>
        current.map((item) =>
          item.key === card.key
            ? { ...visibleNext, refreshing: false, refreshStatus }
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

  if (!cards.length && !hasAccounts) {
    return (
      <NavigationStack>
        <ConnectEmptyView
          provider={provider}
          backgroundTheme={props.backgroundTheme}
          onSelectProvider={setProvider}
          onConnect={() => startAuth(provider)}
        />
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
              overviewWindows={
                listAuthorizedCards().find(
                  (card) => card.key === openedCard.key,
                )?.windows || openedCard.windows
              }
              onOverviewChange={props.onOverviewChange}
              demo={props.demoMode}
              backgroundTheme={props.backgroundTheme}
              onReauthorize={() =>
                startAuth(openedCard.provider, openedCard.accountId)
              }
              onDelete={() => {
                const result = deleteAuthorizedAccount(
                  openedCard.provider,
                  openedCard.accountId,
                );
                requestWidgetReload();
                setOpenedCard(null);
                reloadCards();
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
          ) : (
            <Text>选择账号</Text>
          ),
        }}
      >
        {cards.length === 0 ? (
          <Text
            font={14}
            foregroundStyle="secondaryLabel"
            multilineTextAlignment="center"
            frame={{ maxWidth: "infinity", minHeight: 160 }}
            listRowBackground={<></>}
            listRowSeparator="hidden"
          >
            没有可显示的账号。到设置页打开用量总览开关。
          </Text>
        ) : null}
        {cards.map((card) => (
          <UsageCardView
            key={card.key}
            card={card}
            displayMode={displayMode}
            onRefresh={() => refreshOne(card)}
            onOpen={() => setOpenedCard(card)}
          />
        ))}
        {props.demoMode ? (
          <Text
            font={12}
            foregroundStyle="secondaryLabel"
            multilineTextAlignment="center"
            frame={{ maxWidth: "infinity" }}
            listRowBackground={<></>}
            listRowSeparator="hidden"
          >
            {`当前为演示模式，显示 ${demoAccountCount()} 个样例账号，不会请求真实接口。`}
          </Text>
        ) : null}
      </List>
    </NavigationStack>
  );
}
