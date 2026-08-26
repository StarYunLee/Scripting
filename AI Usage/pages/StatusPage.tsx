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
import { openAuthorizationPage } from "../services/browser";
import { refreshAccounts } from "../services/refresh";
import { requestWidgetReload } from "../services/widgets";
import { type BackgroundThemeId } from "../services/settings";

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function StatusPage(props: {
  demoMode: boolean;
  backgroundTheme: BackgroundThemeId;
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
  }, [props.demoMode]);

  useEffect(() => {
    if (props.demoMode) return;
    const pending = findPendingAuth();
    if (!pending) return;
    setProvider(pending.provider);
    setSheet({
      provider: pending.provider,
      profileId: pending.profileId,
      authorizationInput: "",
      status:
        pending.provider === "cursor" || pending.provider === "kimi"
          ? "存在未完成的授权，请返回应用并点击提交（无需粘贴）"
          : "存在未完成的授权，请粘贴回调或授权码",
    });
  }, [props.demoMode]);

  useEffect(() => {
    const authorized = listAuthorizedCards();
    if (!authorized.length || props.demoMode) return;
    let cancelled = false;
    (async () => {
      for (const card of authorized) {
        if (cancelled) return;
        try {
          const next = await refreshCard(card.provider, card.accountId, false);
          if (!cancelled) {
            setCards((current) =>
              current.map((item) => (item.key === next.key ? next : item)),
            );
          }
        } catch {
          /* keep cache card */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.demoMode]);

  async function startAuth(target: ProviderId, profileId?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const started = await beginProviderAuth(target, profileId);
      // 先打开授权页；关闭后再进入粘贴页，避免状态页被粘贴界面顶掉。
      const mode = await openAuthorizationPage(started.url);
      setSheet({
        provider: target,
        profileId: started.profileId,
        authorizationInput: "",
        status:
          target === "cursor" || target === "kimi"
            ? mode === "present"
              ? "关闭授权页后，返回应用并点击提交（无需粘贴）"
              : target === "kimi"
                ? "已在系统 Safari 打开 Kimi Code 授权页，完成后返回并点击提交"
                : "已在系统 Safari 打开 Cursor 登录页，完成后返回并点击提交"
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
    const targets = cards;
    if (!targets.length) return;
    setBusy(true);
    if (props.demoMode) {
      const nextCards = targets.map((card) => refreshDemoCard(card.accountId));
      setCards(
        nextCards.map((card) => ({
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
              account={(() => {
                const profile = listProviderAccounts(openedCard.provider).find(
                  (item) => item.id === openedCard.accountId,
                );
                const email =
                  profile?.email ||
                  (openedCard.title.includes("@") ? openedCard.title : null);
                const rawName = profile?.name || openedCard.title;
                const safeName =
                  email ||
                  (rawName &&
                  rawName !== openedCard.accountId &&
                  !/^acct_/i.test(rawName)
                    ? rawName
                    : openedCard.title.includes("@")
                      ? openedCard.title
                      : "未命名账号");
                return {
                  id: openedCard.accountId,
                  name: safeName,
                  email,
                };
              })()}
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
          foregroundStyle="tertiaryLabel"
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
