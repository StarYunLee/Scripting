import {
  Button,
  Navigation,
  Script,
  Tab,
  TabView,
  Text,
  VStack,
  useObservable,
  useEffect,
  useState,
} from "scripting";
import { isItemoryError } from "./domain/errors";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { ReviewPage } from "./pages/ReviewPage";
import {
  coordinateMutation,
  holdWritesUntil,
  needsRestartAfterRestore,
  subscribeRestoreRestart,
} from "./services/mutation-coordinator";
import { notifyDataChanged } from "./services/change-store";
import { checkDayChangeNow, subscribeDayChanges } from "./services/day-change";
import { getDatabase } from "./services/db";
import {
  pruneReceiptsAfterStartup,
  quarantineCorruptPendingMutations,
  reconcilePendingMutations,
} from "./services/mutation";
import {
  getPendingState,
  subscribePendingState,
  type PendingState,
} from "./services/pending-state";
import { PendingBlockedPage } from "./ui/pending-blocked";
import { markStartup, timeStartupStep } from "./services/startup-timing";
import {
  InitializationErrorPage,
  ProRequiredPage,
} from "./ui/startup-error";

function AppRoot() {
  const [restartNeeded, setRestartNeeded] = useState(needsRestartAfterRestore);
  useEffect(() => subscribeRestoreRestart(() => setRestartNeeded(true)), []);
  const selection = useObservable<string>("inventory");
  // Mount a tab on first visit only; visited tabs stay mounted.
  const [visitedTabs] = useState(() => new Set<string>(["inventory"]));
  visitedTabs.add(selection.value);
  const [dbReady, setDbReady] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [browseReadOnly, setBrowseReadOnly] = useState(false);
  const [initError, setInitError] = useState<unknown>(null);
  const [pendingState, setPendingState] =
    useState<PendingState>(getPendingState);

  useEffect(() => subscribePendingState(setPendingState), []);
  useEffect(() => subscribeDayChanges(notifyDataChanged), []);

  async function reconcilePending(): Promise<void> {
    const db = await timeStartupStep("getDatabase", getDatabase);
    const unresolved = await timeStartupStep("reconcilePendingMutations", () =>
      reconcilePendingMutations(db),
    );
    if (unresolved.length > 0) {
      console.log(
        `[Mutation] ${unresolved.length} pending operation(s) require reconciliation before retry.`,
      );
    }
  }

  useEffect(() => {
    const unsubscribe = Script.onResume(() => {
      checkDayChangeNow();
      notifyDataChanged();
      void reconcilePending().catch((error) => {
        console.log(
          `[Mutation] Resume reconciliation failed: ${String(error)}`,
        );
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      let db: SQLite.Database;
      try {
        db = await timeStartupStep("getDatabase", getDatabase);
      } catch (e) {
        if (active) setInitError(e);
        return;
      }
      // Pending reconciliation runs in the background; every mutation waits
      // for it. A failure sets lastError, which shows PendingBlockedPage.
      const reconciled = reconcilePending();
      holdWritesUntil(reconciled);
      markStartup("dbReady");
      if (active) setDbReady(true);
      try {
        await reconciled;
      } catch (error) {
        console.log(`[Mutation] Startup reconciliation failed: ${String(error)}`);
        return;
      }
      if (!active) return;
      void coordinateMutation(() => pruneReceiptsAfterStartup(db)).catch(
        (error) => console.log(`[Mutation] Receipt pruning skipped: ${String(error)}`),
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  function retryPending() {
    setInitError(null);
    void reconcilePending().catch(setInitError);
  }

  function retryInitialization() {
    setInitError(null);
    setDbReady(false);
    setInitializing(true);
    void reconcilePending()
      .then(() => setDbReady(true))
      .catch(setInitError)
      .finally(() => setInitializing(false));
  }

  async function confirmQuarantineCorrupt() {
    const confirmed = await Dialog.confirm({
      title: "隔离损坏记录",
      message:
        "损坏文件会保留在待决目录中作为诊断副本，但不再参与写入锁定。隔离后系统会再次核对其余记录。",
      confirmLabel: "隔离并核对",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    try {
      await quarantineCorruptPendingMutations();
      await reconcilePending();
    } catch (error) {
      setInitError(error instanceof Error ? error.message : String(error));
    }
  }

  if (restartNeeded) {
    return (
      <VStack spacing={16} padding={24}>
        <Text font="headline">请重新打开 Itemory</Text>
        <Text>
          恢复已进入维护状态，本次会话不再读写数据。请完全退出并重新打开；若有未完成步骤，启动时会先核对补齐，再进入原页面。
        </Text>
      </VStack>
    );
  }

  if (isItemoryError(initError, "PRO_REQUIRED")) {
    return (
      <ProRequiredPage
        checking={initializing}
        onRetry={retryInitialization}
        onExit={() => Script.exit()}
      />
    );
  }

  if (initError) {
    return (
      <InitializationErrorPage
        message={initError instanceof Error ? initError.message : String(initError)}
        checking={initializing}
        onRetry={retryInitialization}
        onExit={() => Script.exit()}
      />
    );
  }

  if (!dbReady) {
    return (
      <VStack
        alignment="center"
        spacing={16}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        <Text foregroundStyle="secondaryLabel">载入数据中...</Text>
      </VStack>
    );
  }

  const writesBlocked =
    pendingState.unresolvedCount > 0 ||
    pendingState.corruptCount > 0 ||
    pendingState.lastError !== null;
  if (writesBlocked && !browseReadOnly) {
    return (
      <PendingBlockedPage
        count={pendingState.unresolvedCount}
        recoverableCount={pendingState.recoverableCount}
        corruptCount={pendingState.corruptCount}
        checking={pendingState.checking}
        error={pendingState.lastError}
        onRetry={retryPending}
        onBrowse={() => setBrowseReadOnly(true)}
        onQuarantineCorrupt={() => void confirmQuarantineCorrupt()}
      />
    );
  }

  return (
    <VStack spacing={0}>
      {writesBlocked ? (
        <VStack spacing={4} padding={8}>
          <Text font="caption">
            只读浏览：有结果待核对，所有业务写入仍被阻止。
          </Text>
          <Button title="返回核对" action={() => setBrowseReadOnly(false)} />
        </VStack>
      ) : null}
      {(pendingState.failedCleanupCount ?? 0) > 0 ? (
        <VStack spacing={4} padding={8}>
          <Text font="caption">
            本次修改未提交，但待决文件清理失败；系统会继续重试清理。
          </Text>
          <Button title="重试清理" action={retryPending} />
        </VStack>
      ) : null}
      {(pendingState.cleanupWarningCount ?? 0) > 0 ? (
        <VStack spacing={4} padding={8}>
          <Text font="caption">
            业务已提交，待决文件清理失败；请勿重复保存。
          </Text>
          <Button title="重试清理" action={retryPending} />
        </VStack>
      ) : null}
      <TabView selection={selection}>
        <Tab title="物品" systemImage="shippingbox.fill" value="inventory">
          <InventoryPage active={selection.value === "inventory"} />
        </Tab>
        <Tab title="统计" systemImage="chart.bar.xaxis" value="statistics">
          {visitedTabs.has("statistics") ? <StatisticsPage /> : <VStack />}
        </Tab>
        <Tab
          title="回顾"
          systemImage="calendar.day.timeline.left"
          value="review"
        >
          {visitedTabs.has("review") ? <ReviewPage /> : <VStack />}
        </Tab>
        <Tab title="设置" systemImage="gearshape.fill" value="settings">
          {visitedTabs.has("settings") ? <SettingsPage /> : <VStack />}
        </Tab>
      </TabView>
    </VStack>
  );
}

async function run() {
  Script.enableMinimize();
  try {
    // 立即呈现 UI，绝不让异步初始化在 Navigation.present 之前阻塞首屏！
    await Navigation.present({
      element: <AppRoot />,
      modalPresentationStyle: "fullScreen",
    });
  } finally {
    Script.exit();
  }
}

void run();
