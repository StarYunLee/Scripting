/**
 * Restore-work primitives (paths, bounded file proofs, control receipts,
 * verified installs, cleanup) shared by the backup writer and the single-file
 * restore. This is the only restore protocol and the only receipt lifecycle:
 * nothing here dispatches on a backup generation.
 */
import { Path } from "scripting";
import { DATA_HOME, ROOT_DIR } from "./paths";
import { assertPlainFile } from "./backup-safe";
import { BACKUP_RECEIPT_KIND } from "./backup-format";

// A bounded, short-lived recovery workspace. Not a data generation or another data store.
export const RESTORE_WORK = Path.join(DATA_HOME, "restore-work");
export const MANIFEST = Path.join(RESTORE_WORK, "manifest.json");
/** Staged copy of the single-file snapshot. */
export const SINGLE_SNAPSHOT = Path.join(RESTORE_WORK, "snapshot.sqlite");
export const RECEIPT_KIND = BACKUP_RECEIPT_KIND;
export const MAX_BYTES = 32 * 1024 * 1024;

export interface FileProof {
  name: string;
  size: number;
  hash: string;
}

export interface ReceiptRow {
  command_id: string;
  payload_hash: string;
  result_id: string;
}

export function demand(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

export function digest(bytes: Uint8Array): string {
  const data = Data.fromUint8Array(bytes);
  if (!data) throw new Error("恢复文件为空或无法读取");
  return Crypto.sha256(data).toHexString();
}

export function openRestore(
  path: string,
  readonly = false,
): SQLite.Database {
  return SQLite.open(path, {
    readonly,
    foreignKeysEnabled: true,
    journalMode: "default",
    busyMode: 5,
    maximumReaderCount: 1,
    label: "Itemory restore",
  });
}

export async function transaction(
  db: SQLite.Database,
  steps: SQLite.TransactionStep[],
): Promise<void> {
  // Official step-array contract, also verified on the user's native host.
  const native: {
    transaction(
      steps: SQLite.TransactionStep[],
      options: { kind: "immediate" | "deferred" },
    ): Promise<void>;
  } = db as unknown as {
    transaction(
      steps: SQLite.TransactionStep[],
      options: { kind: "immediate" | "deferred" },
    ): Promise<void>;
  };
  await native.transaction(steps, { kind: "immediate" });
}

export async function has(path: string): Promise<boolean> {
  return FileManager.exists(path);
}

/**
 * The active database grows with the user's own data. MAX_BYTES bounds imported
 * backup payloads, not this file: applying it here locked every later launch out
 * once the library passed 32MiB. Only the plain-file safety properties apply.
 */
export async function assertLiveDatabase(path: string): Promise<void> {
  await assertPlainFile(path, Number.MAX_SAFE_INTEGER);
}

export async function readBounded(
  path: string,
  limit = MAX_BYTES,
): Promise<Uint8Array> {
  await assertPlainFile(path, limit);
  return FileManager.readAsBytes(path);
}

export function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const fields = value as Record<string, unknown>;
  return `{${Object.keys(fields)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(fields[key])}`)
    .join(",")}}`;
}

export function hashMutationPayload(value: unknown): string {
  const data = Data.fromRawString(stable(value));
  if (!data) throw new Error("恢复摘要生成失败");
  return Crypto.sha256(data).toHexString();
}

export function receiptIdOf(id: string): string {
  return `restore-${id}`;
}

export async function auditFile(
  path: string,
  expected: FileProof,
  limit = MAX_BYTES,
): Promise<void> {
  const bytes = await readBounded(path, limit);
  demand(
    bytes.length === expected.size && digest(bytes) === expected.hash,
    "恢复文件内容核对失败：" + expected.name,
  );
}

export async function receipts(db: SQLite.Database): Promise<ReceiptRow[]> {
  return db.fetchAll(
    "SELECT command_id,payload_hash,result_id FROM mutation_receipts WHERE kind=?",
    [RECEIPT_KIND],
  );
}

export async function assertNoPendingFiles(): Promise<void> {
  for (const base of new Set([DATA_HOME, ROOT_DIR])) {
    for (const name of ["pending", "exchange-journals"]) {
      const dir = Path.join(base, name);
      if (await has(dir)) {
        demand(!(await FileManager.isLink(dir)), "待决目录不能为链接");
        const entries = await FileManager.readDirectory(dir);
        demand(
          !entries.some(
            (entry) => entry.endsWith(".json") || entry.endsWith(".next"),
          ),
          "暂存后仍有待决操作，请先核对，未恢复或删除记录",
        );
      }
    }
  }
}

export async function removeVerified(path: string): Promise<void> {
  try {
    await FileManager.remove(path);
  } catch (error) {
    if (await has(path)) throw error;
  }
  demand(!(await has(path)), "恢复文件删除结果未确认");
}

/** Installs a copy from another verified file, keeping commit truth in the target. */
export async function installFile(
  source: string,
  target: string,
  expected: FileProof,
): Promise<void> {
  await auditFile(source, expected);
  await installVerifiedBytes(target, await readBounded(source), expected);
}

/**
 * Writes bytes to a live path and proves the result by reading it back. A write
 * that reported an error but produced a correct file is a success; anything
 * else is a failure.
 */
export async function installVerifiedBytes(
  target: string,
  bytes: Uint8Array,
  expected: { name: string; size: number; hash: string },
): Promise<void> {
  let reported: unknown = null;
  try {
    await FileManager.writeAsBytes(target, bytes);
  } catch (error) {
    reported = error;
  }
  try {
    await auditFile(target, {
      name: expected.name,
      size: expected.size,
      hash: expected.hash,
    });
  } catch (error) {
    throw reported ?? error;
  }
}

/**
 * Removes the pointer, the recovery workspace and the control receipt of a
 * completed restore. Every step is verified; a failure keeps the workspace so
 * the next launch can finish the cleanup.
 */
export async function cleanupCompleted(
  db: SQLite.Database,
  row: ReceiptRow,
): Promise<void> {
  demand(
    row.result_id === "complete" && /^restore-[A-Fa-f0-9-]{36}$/.test(row.command_id),
    "恢复完成凭据格式错误",
  );
  const pointer = Path.join(DATA_HOME, "active.json");
  if (await has(pointer)) await removeVerified(pointer);
  demand(!(await has(pointer)), "旧恢复指针未清理，请重新打开继续核对");
  if (await has(RESTORE_WORK)) await removeVerified(RESTORE_WORK);
  demand(!(await has(RESTORE_WORK)), "恢复工作数据未清理，请重新打开继续核对");
  const remove = {
    sql: "DELETE FROM mutation_receipts WHERE command_id=? AND kind=? AND payload_hash=? AND result_id='complete'",
    args: [row.command_id, RECEIPT_KIND, row.payload_hash],
  };
  let handle = db;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 150 * attempt));
      handle = openRestore(Path.join(DATA_HOME, "data.sqlite"));
    }
    try {
      await transaction(handle, [remove]);
    } catch {
      console.log(`[Restore] completion receipt delete reported an error (attempt ${attempt + 1})`);
    }
    const remaining = await receipts(handle);
    if (!remaining.length) return;
    demand(remaining.length === 1 && remaining[0].command_id === row.command_id &&
      remaining[0].payload_hash === row.payload_hash && remaining[0].result_id === "complete",
      "恢复凭据已变化，请重新打开核对");
  }
  throw new Error("数据已恢复，最后的清理仍在等待。请重新打开 Itemory 完成核对。");
}
