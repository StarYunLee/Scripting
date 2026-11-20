import {
  Button,
  HStack,
  Image,
  List,
  Script,
  Spacer,
  Text,
  VStack,
  useEffect,
  useRef,
  useState,
} from "scripting";


import {
  exportFullBackup,
  formatBytes,
  getLocalDataOverview,
  restoreConfirmMessage,
  restoreFullBackup,
  type LocalDataOverview,
  type RestoreSummary,
} from "../services/backup";
import { exportExchangeData } from "../services/exchange";
import { ImportDataPage } from "./ImportDataPage";
import { subscribeDataChanges } from "../services/change-store";
import { needsRestartAfterRestore } from "../services/mutation-coordinator";
import { NativeSectionHeader } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";

function ActionRow(props: {
  title: string;
  subtitle: string;
  icon: string;
  iconColor?: "blue" | "green" | "orange" | "purple";
  busy?: boolean;
  statusTitle?: string;
  navigation?: boolean;
  action: () => void;
}) {
  const iconColor = props.iconColor === "green" ? "#34C759"
    : props.iconColor === "orange" ? "#FF9500"
    : props.iconColor === "purple" ? "#AF52DE" : "accentColor";
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      accessibilityValue={props.busy ? props.statusTitle : undefined}
      action={props.busy ? () => {} : props.action}
    >
      <HStack
        spacing={12}
        frame={{ maxWidth: "infinity" }}
        alignment="center"
        contentShape="rect"
      >
        <Image systemName={props.icon} font={17} foregroundStyle={iconColor}
          frame={{ width: 24, height: 24 }} />
        <VStack alignment="leading" spacing={2}>
          <Text font="body">{props.busy ? props.statusTitle ?? props.title : props.title}</Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {props.subtitle}
          </Text>
        </VStack>
        <Spacer />
        {props.navigation ? (
          <Image
            systemName="chevron.right"
            font={13}
            fontWeight="semibold"
            foregroundStyle="tertiaryLabel"
          />
        ) : null}
      </HStack>
    </Button>
  );
}

function StatRow(props: {
  title: string;
  value: string;
  icon: string;
  iconColor?: "blue" | "green" | "purple";
}) {
  return (
    <HStack
      spacing={12}
      alignment="center"
      contentShape="rect"
    >
      <Image
        systemName={props.icon}
        font={17}
        foregroundStyle={
          props.iconColor === "green"
            ? "#34C759"
            : props.iconColor === "purple"
              ? "#AF52DE"
              : "accentColor"
        }
        frame={{ width: 24, height: 24 }}
      />
      <Text font="body">{props.title}</Text>
      <Spacer />
      <Text font="body" foregroundStyle="secondaryLabel">
        {props.value}
      </Text>
    </HStack>
  );
}

export function BackupSettingsPage() {
  const uiTheme = useSettingsTheme();
  const [showImport, setShowImport] = useState(false);
  const [overview, setOverview] = useState<LocalDataOverview>({
    itemCount: 0,
    moneyEntryCount: 0,
    coverImageCount: 0,
    coverTotalSizeBytes: 0,
  });
  const [overviewError, setOverviewError] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [exportTitle, setExportTitle] = useState("正在生成备份…");
  const [restoreTitle, setRestoreTitle] = useState("正在选择备份…");
  const [exchangeBusy, setExchangeBusy] = useState<string | null>(null);
  const actionLock = useRef(false);
  const overviewGeneration = useRef(0);
  const overviewAlive = useRef(true);
  async function handleExchange(kind: string, work: () => Promise<void>) {
    if (actionLock.current || exportBusy || restoreBusy || exchangeBusy) return;
    actionLock.current = true;
    setExchangeBusy(kind);
    try {
      await work();
    } finally {
      actionLock.current = false;
      setExchangeBusy(null);
      void refreshStats();
    }
  }

  async function refreshStats() {
    if (!overviewAlive.current) return;
    const generation = ++overviewGeneration.current;
    try {
      const data = await getLocalDataOverview();
      if (!overviewAlive.current || generation !== overviewGeneration.current) return;
      setOverview(data);
      setOverviewLoaded(true);
      setOverviewError(false);
    } catch {
      if (!overviewAlive.current || generation !== overviewGeneration.current) return;
      setOverviewError(true);
    }
  }

  useEffect(() => {
    overviewAlive.current = true;
    void refreshStats();
    const unsubscribe = subscribeDataChanges(() => void refreshStats());
    return () => {
      overviewAlive.current = false;
      overviewGeneration.current++;
      unsubscribe();
      // A pending confirmation on an unmounted page counts as cancel.
      restoreAnswer.current?.(false);
      restoreAnswer.current = null;
    };
  }, []);

  // Single red destructive confirmation (SwiftUI alert) for restore.
  const [restorePrompt, setRestorePrompt] = useState<RestoreSummary | null>(null);
  const restoreAnswer = useRef<((ok: boolean) => void) | null>(null);
  function askRestore(summary: RestoreSummary): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      setRestoreTitle("等待确认恢复…");
      restoreAnswer.current = resolve;
      setRestorePrompt(summary);
    });
  }
  function answerRestore(ok: boolean) {
    const resolve = restoreAnswer.current;
    restoreAnswer.current = null;
    setRestorePrompt(null);
    if (ok) setRestoreTitle("正在准备恢复…");
    resolve?.(ok);
  }

  async function handleExport() {
    if (actionLock.current || exportBusy || restoreBusy || exchangeBusy) return;
    actionLock.current = true;
    setExportTitle("正在生成备份…");
    setExportBusy(true);
    try {
      await exportFullBackup(stage => {
        if (overviewAlive.current) setExportTitle(stage === "validating" ? "正在校验备份…" : "等待保存或分享…");
      });
    } finally {
      actionLock.current = false;
      setExportBusy(false);
      void refreshStats();
    }
  }

  // Test build probe: relaunch via run_single URL, then exit so the next
  // instance completes the restore. Falls back to a manual reopen prompt.
  async function relaunchForRestore() {
    let opened = false;
    try {
      opened = await Safari.openURL(Script.createRunSingleURLScheme(Script.name));
    } catch (error) {
      console.log(`[Restore] relaunch failed: ${String(error)}`);
    }
    console.log(`[Restore] relaunch opened=${opened}`);
    if (!opened) {
      try {
        await Dialog.alert({
          title: "没能自动重新打开",
          message: "请退出后手动打开 Itemory，以完成恢复。",
          buttonLabel: "退出 Itemory",
        });
      } catch {}
    }
    Script.exit();
  }

  async function handleRestore() {
    if (actionLock.current || exportBusy || restoreBusy || exchangeBusy || !overviewAlive.current) return;
    actionLock.current = true;
    setRestoreTitle("正在选择备份…");
    setRestoreBusy(true);
    let prepared = false;
    try {
      prepared = await restoreFullBackup({ confirm: askRestore, onInspect: () => {
        if (overviewAlive.current) setRestoreTitle("正在校验备份…");
      } });
      if (prepared) {
        if (overviewAlive.current) setRestoreTitle("正在重新打开…");
        await relaunchForRestore();
      }
    } finally {
      // Success is terminal: do not refresh old facts or update an unmounted page.
      // A staging error may already have stopped the session; keep that fallback.
      if (!prepared && overviewAlive.current) {
        actionLock.current = false;
        setRestoreBusy(false);
        if (!needsRestartAfterRestore()) void refreshStats();
      }
    }
  }

  return (
    <List
      alert={{
        title: "恢复这份备份？",
        isPresented: restorePrompt !== null,
        onChanged: (presented) => {
          if (presented) return;
          setRestorePrompt(null);
          // Safety net: a dismissal without a button tap must not hang restore.
          setTimeout(() => {
            if (restoreAnswer.current) answerRestore(false);
          }, 300);
        },
        message: (
          <Text>{restorePrompt ? restoreConfirmMessage(restorePrompt) : ""}</Text>
        ),
        actions: (
          <>
            <Button
              title="恢复并重新打开"
              role="destructive"
              action={() => answerRestore(true)}
            />
            <Button title="取消" role="cancel" action={() => answerRestore(false)} />
          </>
        ),
      }}
      navigationDestination={{
        isPresented: showImport,
        onChanged: setShowImport,
        content: <ImportDataPage runOperation={handleExchange} />,
      }}
      {...appListProps(uiTheme, "inline")}
    >
      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="本地数据" />}
      >
          <StatRow
            title="物品档案"
            value={
              overviewError
                ? "读取失败"
                : !overviewLoaded
                  ? "读取中…"
                  : `${overview.itemCount} 件`
            }
            icon="shippingbox.fill"
          />
          <StatRow
            title="收支流水"
            value={
              overviewError
                ? "读取失败"
                : !overviewLoaded
                  ? "读取中…"
                  : `${overview.moneyEntryCount} 笔`
            }
            icon="dollarsign.circle.fill"
            iconColor="green"
          />
          <StatRow
            title="封面图片"
            value={
              overviewError
                ? "读取失败"
                : !overviewLoaded
                  ? "读取中…"
                  : `${overview.coverImageCount} 张 (${formatBytes(overview.coverTotalSizeBytes)})`
            }
            icon="photo.fill"
            iconColor="purple"
          />
      </AppSection>

      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="完整备份与恢复" />}
      >
          <ActionRow
            title="导出完整备份"
            subtitle="将记录、封面和设置保存为单个 SQLite 备份（.itemory）"
            icon="archivebox.fill"
            busy={exportBusy}
            statusTitle={exportTitle}
            action={() => void handleExport()}
          />
          <ActionRow
            title="从完整备份恢复"
            subtitle="用 .itemory 备份替换当前数据（单文件 SQLite）"
            icon="arrow.clockwise.circle.fill"
            iconColor="orange"
            busy={restoreBusy}
            statusTitle={restoreTitle}
            action={() => void handleRestore()}
          />
      </AppSection>

      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="数据交换" />}
      >
          <ActionRow
            title="导出数据"
            subtitle="包含全部物品记录与封面，可用于迁移"
            icon="square.and.arrow.up"
            busy={exchangeBusy === "export"}
            statusTitle="正在导出数据…"
            action={() => void handleExchange("export", exportExchangeData)}
          />
          <ActionRow
            title="导入数据"
            subtitle="查看准备步骤，或选择转换好的数据包"
            icon="square.and.arrow.down"
            iconColor="green"
            navigation
            action={() => {
              if (!actionLock.current) setShowImport(true);
            }}
          />
      </AppSection>
    </List>
  );
}
