import { Path } from "scripting";
import { getDatabase } from "./db";
import {
  coordinateMutation,
  requireRestartAfterRestore,
  assertSessionWritable,
} from "./mutation-coordinator";
import { assertPlainFile } from "./backup-safe";
import { RESTORE_WORK } from "./backup-work";
import {
  inspectSingleFileBackup,
  isSingleFileBackup,
  stageSingleFileRestore,
  writeSingleFileSnapshot,
} from "./backup-single";
import { ASSET_BLOBS_TABLE, SINGLE_FILE_LIMIT } from "./backup-format";
import { tableExists } from "./backup-blob";
import { flushPrefs } from "./prefs";

export type { BackupInspection } from "./backup-format";

export interface LocalDataOverview {
  itemCount: number;
  moneyEntryCount: number;
  coverImageCount: number;
  coverTotalSizeBytes: number;
}
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"],
    i = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))),
    v = bytes / 1024 ** i;
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
/**
 * The live `asset_blobs` store is the only cover authority: a derived cover file
 * may legitimately be missing, and there is no file-counting fallback left.
 * Without the blob store (schema not yet initialized) the overview reports no
 * covers instead of reading the filesystem.
 */
export async function getLocalDataOverview(): Promise<LocalDataOverview> {
  const db = await getDatabase();
  const [counts] = await db.fetchAll<{ items: number; money: number }>(
    "SELECT (SELECT count(*) FROM items) items,(SELECT count(*) FROM money_entries) money",
  );
  if (!(await tableExists(db, ASSET_BLOBS_TABLE)))
    return {
      itemCount: counts.items,
      moneyEntryCount: counts.money,
      coverImageCount: 0,
      coverTotalSizeBytes: 0,
    };
  const [blobs] = await db.fetchAll<{ n: number; bytes: number }>(
    `SELECT count(*) n, coalesce(sum(byte_size),0) bytes FROM ${ASSET_BLOBS_TABLE}`,
  );
  return {
    itemCount: counts.items,
    moneyEntryCount: counts.money,
    coverImageCount: Number(blobs?.n ?? 0),
    coverTotalSizeBytes: Number(blobs?.bytes ?? 0),
  };
}

export { inspectSingleFileBackup };

let busy = false;
async function backupFlow(
  work: (temp: string) => Promise<boolean>,
): Promise<boolean> {
  if (busy) return false;
  busy = true;
  const temp = Path.join(
    FileManager.temporaryDirectory,
    `itemory-backup-${UUID.string()}`,
  );
  try {
    assertSessionWritable();
    await FileManager.createDirectory(temp, true);
    return await work(temp);
  } catch (e) {
    await Dialog.alert({
      title: "备份操作未完成",
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  } finally {
    // Cleanup failure is NEVER a reason to roll back a completed restore.
    try {
      if (await FileManager.exists(temp)) await FileManager.remove(temp);
    } catch {
      /* Safe temporary residue. */
    }
    busy = false;
  }
}

/**
 * Full export: one self-contained SQLite file (`asset_blobs` carries the cover
 * bytes, `backup_document` carries the format marker and settings). This is the
 * only backup format the app writes or reads.
 */
export async function exportFullBackup(onStage?: (stage: "validating" | "sharing") => void): Promise<boolean> {
  return backupFlow(async (temp) => {
    const snapshot = Path.join(temp, `Itemory-Backup-${Date.now()}.itemory`);
    await coordinateMutation(async () => {
      const db = await getDatabase();
      await flushPrefs();
      await writeSingleFileSnapshot(db, snapshot);
    });
    // Finalization of the artifact itself: plain-file bounds, full validation
    // and only then the share sheet. Nothing partial is ever shared.
    onStage?.("validating");
    await assertPlainFile(snapshot, SINGLE_FILE_LIMIT);
    const inspection = await inspectSingleFileBackup(snapshot);
    if (!inspection.isValid) throw new Error(inspection.errorMessage);
    onStage?.("sharing");
    return ShareSheet.present([snapshot]);
  });
}
export type RestoreSummary = {
  itemCount: number;
  moneyEntryCount: number;
  coverCount: number;
};

export function restoreConfirmMessage(summary: RestoreSummary): string {
  return (
    `备份内容：\n物品 ${summary.itemCount} 件 · 流水 ${summary.moneyEntryCount} 笔 · 封面 ${summary.coverCount} 张\n\n` +
    "当前的数据和设置将被替换，且无法撤销。\n确认后 Itemory 会自动重新打开并完成恢复。"
  );
}

/** Fallback confirmation when no page-level (red destructive) alert is supplied. */
async function defaultRestoreConfirm(summary: RestoreSummary): Promise<boolean> {
  return await Dialog.confirm({
    title: "恢复这份备份？",
    message: restoreConfirmMessage(summary),
    confirmLabel: "恢复并重新打开",
    cancelLabel: "取消",
  });
}

/** Single-file snapshot: one verified copy, one file hash, no external staging. */
async function prepareSingleRestore(
  snapshot: string,
  confirm: (summary: RestoreSummary) => Promise<boolean>,
): Promise<boolean> {
  const inspection = await inspectSingleFileBackup(snapshot);
  if (!inspection.isValid) throw new Error(inspection.errorMessage);
  if (
    !(await confirm({
      itemCount: inspection.itemCount,
      moneyEntryCount: inspection.moneyEntryCount,
      coverCount: inspection.coverCount,
    }))
  )
    return false;
  await getDatabase(); // Settle startup outside the write queue to avoid nesting.
  await coordinateMutation(async () => {
    await flushPrefs();
    try {
      await stageSingleFileRestore(snapshot);
      requireRestartAfterRestore(false);
    } catch (error) {
      if (await FileManager.exists(RESTORE_WORK)) requireRestartAfterRestore();
      throw error;
    }
  });
  return true;
}

/**
 * Single-confirmation restore: the only prompt is the destructive confirmation.
 * On success the caller relaunches immediately; there is no second alert.
 * Only a SQLite v2 single-file snapshot is accepted; the format is decided by
 * the file itself, never by its name, and an obsolete ZIP backup is refused
 * with an explicit message instead of being unpacked.
 */
export async function restoreFullBackup(
  options: { confirm?: (summary: RestoreSummary) => Promise<boolean>; onInspect?: () => void } = {},
): Promise<boolean> {
  const confirm = options.confirm ?? defaultRestoreConfirm;
  return await backupFlow(async (temp) => {
    const file = (
      await DocumentPicker.pickFiles({
        types: ["public.data"],
        allowsMultipleSelection: false,
      })
    )[0];
    if (!file) return false;
    const snapshot = Path.join(temp, "input.itemory");
    try {
      options.onInspect?.();
      await assertPlainFile(file, SINGLE_FILE_LIMIT);
      await FileManager.copyFile(file, snapshot);
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources();
    }
    if (!(await isSingleFileBackup(snapshot)))
      throw new Error(
        "该文件不是当前支持的 SQLite v2 备份（.itemory）；旧版压缩包备份需要在新版本之前恢复",
      );
    return prepareSingleRestore(snapshot, confirm);
  });
}
