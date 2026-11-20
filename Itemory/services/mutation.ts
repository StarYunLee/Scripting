import type { ItemCondition } from "../models/types";
import { ItemoryError, isItemoryError } from "../domain/errors";
import { uniqueSortedIds } from "../domain/validation";

export type MutationKind =
  | "data.import"
  | "item.create"
  | "item.update"
  | "item.delete"
  | "money.add"
  | "money.update"
  | "money.delete"
  | "item.exit"
  | "item.undoExit"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "tag.create"
  | "tag.update"
  | "tag.delete";

export interface MutationContext {
  commandId: string;
  kind: MutationKind;
  payloadHash: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(source[k])}`)
    .join(",")}}`;
}

export function hashMutationPayload(payload: unknown): string {
  const data = Data.fromRawString(stable(payload));
  if (!data) throw new Error("无法生成提交摘要");
  return Crypto.sha256(data).toHexString();
}

export function newMutationContext(
  kind: MutationKind,
  payload: unknown,
): MutationContext {
  return {
    commandId: UUID.string(),
    kind,
    payloadHash: hashMutationPayload(payload),
  };
}

export function assertMutationContext(
  command: MutationContext,
  kind: MutationKind,
  payload: unknown,
): void {
  if (
    command.kind !== kind ||
    command.payloadHash !== hashMutationPayload(payload)
  ) {
    throw new Error("IdempotencyConflict：提交凭据与实际操作内容不匹配");
  }
}

export async function findReceipt(
  db: SQLite.Database,
  command: MutationContext,
): Promise<string | null> {
  const rows = await db.fetchAll<{
    kind: string;
    payload_hash: string;
    result_id: string;
  }>(
    "SELECT kind, payload_hash, result_id FROM mutation_receipts WHERE command_id = ?",
    [command.commandId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.kind !== command.kind || row.payload_hash !== command.payloadHash) {
    throw new Error("IdempotencyConflict：同一 commandId 被用于不同操作内容");
  }
  return row.result_id;
}

export function appendReceipt(
  sql: string,
  args: SQLite.DatabaseValue[],
  command: MutationContext,
  resultId: string,
  now: number,
) {
  return {
    sql: `${sql}\nINSERT INTO mutation_receipts(command_id, kind, payload_hash, result_id, created_at) VALUES (?, ?, ?, ?, ?);`,
    args: [
      ...args,
      command.commandId,
      command.kind,
      command.payloadHash,
      resultId,
      now,
    ],
  };
}

export interface ItemMutationPayloadInput {
  id?: string | null;
  name: string;
  categoryId: string | null;
  acquiredOn: string;
  acquisitionAmountMinor: number | null;
  holdingCondition: ItemCondition;
  iconSymbol: string | null;
  coverAssetId: string | null;
  channel: string | null;
  warrantyUntil: string | null;
  valuationMinor: number | null;
  notes: string | null;
  tagIds: string[];
  expectedRevision?: number | null;
}

export function buildItemMutationPayload(input: ItemMutationPayloadInput) {
  return {
    id: input.id ?? null,
    name: input.name.trim(),
    categoryId: input.categoryId || null,
    acquiredOn: input.acquiredOn,
    acquisitionAmountMinor: input.acquisitionAmountMinor,
    holdingCondition: input.holdingCondition,
    iconSymbol: input.iconSymbol || null,
    coverAssetId: input.coverAssetId || null,
    channel: input.channel?.trim() || null,
    warrantyUntil: input.warrantyUntil || null,
    valuationMinor: input.valuationMinor,
    notes: input.notes?.trim() || null,
    tagIds: uniqueSortedIds(input.tagIds),
    expectedRevision: input.expectedRevision ?? null,
  };
}

export interface MoneyMutationPayloadInput {
  id?: string | null;
  itemId: string;
  direction?: string | null;
  kind?: string | null;
  amountMinor?: number | null;
  occurredOn?: string | null;
  title?: string | null;
  note?: string | null;
  expectedRevision: number;
}

export function buildMoneyMutationPayload(input: MoneyMutationPayloadInput) {
  return {
    id: input.id ?? null,
    itemId: input.itemId,
    direction: input.direction ?? null,
    kind: input.kind ?? null,
    amountMinor: input.amountMinor ?? null,
    occurredOn: input.occurredOn ?? null,
    title: input.title?.trim() || null,
    note: input.note?.trim() || null,
    expectedRevision: input.expectedRevision,
  };
}

export interface ExitMutationPayloadInput {
  itemId: string;
  reason?: string | null;
  exitedOn?: string | null;
  recoveryAmountMinor?: number | null;
  note?: string | null;
  expectedRevision: number;
}

export function buildExitMutationPayload(input: ExitMutationPayloadInput) {
  return {
    itemId: input.itemId,
    reason: input.reason ?? null,
    exitedOn: input.exitedOn ?? null,
    recoveryAmountMinor: input.recoveryAmountMinor ?? null,
    note: input.note?.trim() || null,
    expectedRevision: input.expectedRevision,
  };
}

export function buildDeleteItemMutationPayload(
  itemId: string,
  expectedRevision: number,
) {
  return { itemId, expectedRevision };
}

import { PENDING_DIR, ensureDataDirectories } from "./paths";
import {
  getPendingState,
  setPendingState,
  type PendingIssueSummary,
} from "./pending-state";

type PendingRecord = MutationContext & {
  resultId: string;
  startedAt: number;
  sessionId: string;
};

const PENDING_SESSION_ID = UUID.string();
const activeCommands = new Set<string>();
const knownFailedCommands = new Set<string>();
let pendingDatabase: SQLite.Database | null = null;
let inspectionVersion = 0;
const MUTATION_KINDS = new Set<MutationKind>([
  "data.import",
  "item.create",
  "item.update",
  "item.delete",
  "money.add",
  "money.update",
  "money.delete",
  "item.exit",
  "item.undoExit",
  "category.create",
  "category.update",
  "category.delete",
  "tag.create",
  "tag.update",
  "tag.delete",
]);

function assertSafeCommandId(commandId: string): void {
  if (!/^[A-Za-z0-9-]+$/.test(commandId))
    throw new Error("PendingMutation：commandId 无效");
}

function pendingPath(commandId: string): string {
  assertSafeCommandId(commandId);
  return `${PENDING_DIR}/${commandId}.json`;
}

function entryName(entry: string): string {
  return entry.includes("/") ? entry.slice(entry.lastIndexOf("/") + 1) : entry;
}

function entryPath(entry: string): string {
  return entry.includes("/") ? entry : `${PENDING_DIR}/${entry}`;
}

function parsePendingRecord(text: string): PendingRecord {
  const value = JSON.parse(text) as Partial<PendingRecord>;
  if (
    typeof value.commandId !== "string" ||
    !/^[A-Za-z0-9-]+$/.test(value.commandId) ||
    typeof value.kind !== "string" ||
    !MUTATION_KINDS.has(value.kind as MutationKind) ||
    typeof value.payloadHash !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(value.payloadHash) ||
    typeof value.resultId !== "string" ||
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt) ||
    (value.sessionId !== undefined && typeof value.sessionId !== "string")
  ) {
    throw new Error("pending journal 结构无效");
  }
  return {
    commandId: value.commandId,
    kind: value.kind as MutationKind,
    payloadHash: value.payloadHash,
    resultId: value.resultId,
    startedAt: value.startedAt,
    sessionId: value.sessionId ?? "legacy",
  };
}

async function writePendingAtomically(record: PendingRecord): Promise<void> {
  const target = pendingPath(record.commandId);
  const temporary = `${PENDING_DIR}/.${record.commandId}-${UUID.string()}.tmp`;
  await FileManager.writeAsString(temporary, JSON.stringify(record));
  try {
    await FileManager.rename(temporary, target);
  } catch (error) {
    try {
      if (await FileManager.exists(temporary))
        await FileManager.remove(temporary);
    } catch {
      // Temporary cleanup is best effort; .tmp files are never treated as journals.
    }
    throw error;
  }
}

export async function beginPendingMutation(
  command: MutationContext,
  resultId: string,
): Promise<void> {
  await ensureDataDirectories();
  const inspected = await inspectPendingFiles();
  if (inspected.corrupt.length) throw new Error("存在损坏待决记录，请先核对");
  for (const record of inspected.valid) {
    if (record.commandId === command.commandId) continue;
    if (pendingDatabase && (await findReceipt(pendingDatabase, record)))
      continue;
    throw new Error("存在尚未确认结果的操作，请先核对后再试。");
  }

  const target = pendingPath(command.commandId);
  if (await FileManager.exists(target)) {
    const existing = parsePendingRecord(await FileManager.readAsString(target));
    if (
      existing.kind !== command.kind ||
      existing.payloadHash !== command.payloadHash ||
      existing.resultId !== resultId
    ) {
      throw new Error("IdempotencyConflict：待决提交凭据与当前操作不匹配");
    }
    return;
  }

  const record: PendingRecord = {
    ...command,
    resultId,
    startedAt: Date.now(),
    sessionId: PENDING_SESSION_ID,
  };
  await writePendingAtomically(record);
}

async function inspectPendingFiles(): Promise<{
  valid: PendingMutation[];
  corrupt: PendingIssueSummary[];
}> {
  await ensureDataDirectories();
  const entries = await FileManager.readDirectory(PENDING_DIR);
  const valid: PendingMutation[] = [];
  const corrupt: PendingIssueSummary[] = [];
  for (const entry of entries) {
    const name = entryName(entry);
    if (!name.endsWith(".json")) continue;
    const path = entryPath(entry);
    let text: string;
    try {
      text = await FileManager.readAsString(path);
    } catch (error) {
      // A concurrent successful cleanup is not a corrupt journal.
      if (!(await FileManager.exists(path))) continue;
      throw error;
    }
    try {
      const record = parsePendingRecord(text);
      if (name !== `${record.commandId}.json`)
        throw new Error("journal filename mismatch");
      valid.push(record);
    } catch {
      corrupt.push({
        id: name,
        commandId: null,
        kind: "corrupt",
        recoverable: true,
      });
    }
  }
  return { valid, corrupt };
}

export async function refreshPendingState(): Promise<void> {
  if (!pendingDatabase) {
    const { getDatabase } = await import("./db");
    pendingDatabase = await getDatabase();
  }
  try {
    await reconcilePendingMutations(pendingDatabase);
  } catch {
    /* reconcile publishes the storage error; do not reverse commit truth. */
  }
}

export type PendingCleanupResult = {
  status: "removed" | "missing" | "failed";
  error?: string;
};

export async function clearPendingMutation(
  commandId: string,
): Promise<PendingCleanupResult> {
  try {
    const path = pendingPath(commandId);
    if (!(await FileManager.exists(path))) return { status: "missing" };
    await FileManager.remove(path);
    if (await FileManager.exists(path))
      return { status: "failed", error: "待决文件删除后仍存在" };
    return { status: "removed" };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function isUnknownMutationError(error: unknown): boolean {
  if (isItemoryError(error, "PENDING_MUTATION")) return true;
  const text = String(error).toLowerCase();
  return (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("database is locked") ||
    text.includes("busy") ||
    text.includes("not returned")
  );
}

function unknownMutationError(cause: unknown): ItemoryError {
  return new ItemoryError(
    "PENDING_MUTATION",
    "提交结果暂时无法确认，请保留当前操作并重新核对待决状态。",
    cause,
  );
}

export async function executeMutationBatch(
  db: SQLite.Database,
  command: MutationContext,
  resultId: string,
  sql: string,
  args: SQLite.DatabaseValue[],
): Promise<void> {
  pendingDatabase = db;
  activeCommands.add(command.commandId);
  try {
    await beginPendingMutation(command, resultId);
    try {
      await db.execute(sql, args);
      await clearPendingMutation(command.commandId);
      await refreshPendingState();
    } catch (error) {
      let receiptLookupFailed = false;
      try {
        if (await findReceipt(db, command)) {
          await clearPendingMutation(command.commandId);
          await refreshPendingState();
          return;
        }
      } catch {
        receiptLookupFailed = true;
      }

      if (receiptLookupFailed || isUnknownMutationError(error)) {
        // The database result cannot be proven. Preserve the journal and expose
        // a stable unknown outcome so callers never retry or roll files back.
        await refreshPendingState();
        throw unknownMutationError(error);
      }

      const cleanup = await clearPendingMutation(command.commandId);
      if (cleanup.status === "failed")
        knownFailedCommands.add(command.commandId);
      else knownFailedCommands.delete(command.commandId);
      await refreshPendingState();
      throw error;
    }
  } finally {
    activeCommands.delete(command.commandId);
    await refreshPendingState();
  }
}

export interface PendingMutation extends MutationContext {
  resultId: string;
  startedAt: number;
  sessionId: string;
}

/** Retention window for settled, allowlisted ordinary operation receipts. */
export const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Explicit allowlist of settled receipts that ordinary maintenance may remove.
 * `data.import` receipts are permanent content-hash de-duplication keys
 * (exchange.ts derives the command id from the payload hash), `backup.restore`
 * receipts are restore control records, and any kind not listed here — known
 * or unknown — is kept by default instead of being swept by a blacklist.
 */
const PRUNABLE_RECEIPT_KINDS: readonly MutationKind[] = [
  "item.create",
  "item.update",
  "item.delete",
  "item.exit",
  "item.undoExit",
  "money.add",
  "money.update",
  "money.delete",
  "category.create",
  "category.update",
  "category.delete",
  "tag.create",
  "tag.update",
  "tag.delete",
];
const PRUNABLE_KIND_HOLES = PRUNABLE_RECEIPT_KINDS.map(() => "?").join(",");
/** Hard cap per startup pass; a larger backlog drains across launches. */
const RECEIPT_PRUNE_BATCH_LIMIT = 250;

/**
 * Best-effort removal of settled idempotency receipts so mutation_receipts
 * does not grow forever. Only allowlisted kinds are eligible, the retention
 * boundary is strict (`created_at < now - RECEIPT_RETENTION_MS`), every
 * command id still referenced by a pending journal is kept, and at most
 * RECEIPT_PRUNE_BATCH_LIMIT rows are removed per call. Pending ids use one
 * bound JSON value, so they are excluded before LIMIT without an unbounded
 * SQL parameter list or starving settled rows behind protected old receipts.
 * The DELETE repeats the kind/time predicates so a
 * receipt that changed between fetch and delete is never removed. One
 * db.execute is the host's atomic boundary; failures only log and never
 * block startup.
 */
export async function pruneSettledReceipts(
  db: SQLite.Database,
  pendingCommandIds: readonly string[],
  now: number = Date.now(),
): Promise<void> {
  // Never compete with an in-flight command: its receipt may still be needed.
  if (activeCommands.size > 0) return;
  const cutoff = now - RECEIPT_RETENTION_MS;
  const protectedIds = new Set(pendingCommandIds);
  try {
    const rows = await db.fetchAll<{ command_id: string }>(
      `SELECT command_id FROM mutation_receipts WHERE created_at < ? AND kind IN (${PRUNABLE_KIND_HOLES}) AND command_id NOT IN (SELECT value FROM json_each(?)) ORDER BY created_at ASC LIMIT ?`,
      [cutoff, ...PRUNABLE_RECEIPT_KINDS, JSON.stringify([...protectedIds]), RECEIPT_PRUNE_BATCH_LIMIT],
    );
    const candidates: string[] = [];
    for (const row of rows) {
      const commandId = row?.command_id;
      if (
        typeof commandId === "string" &&
        commandId.length > 0 &&
        !protectedIds.has(commandId)
      )
        candidates.push(commandId);
    }
    if (candidates.length === 0) return;
    // A command may have started while the candidates were fetched.
    if (activeCommands.size > 0) return;
    const idHoles = candidates.map(() => "?").join(",");
    await db.execute(
      `DELETE FROM mutation_receipts WHERE command_id IN (${idHoles}) AND created_at < ? AND kind IN (${PRUNABLE_KIND_HOLES});`,
      [...candidates, cutoff, ...PRUNABLE_RECEIPT_KINDS],
    );
  } catch (error) {
    console.log(`[Mutation] Receipt pruning skipped: ${String(error)}`);
  }
}

/**
 * Startup-only receipt maintenance. Never runs inside a mutation's own
 * reconciliation (the caller may still need to read its receipt). Skips when
 * a command is active or a journal is unreadable, and keeps every receipt a
 * remaining journal (including committed-but-uncleaned ones) still names.
 */
export async function pruneReceiptsAfterStartup(
  db: SQLite.Database,
): Promise<void> {
  if (activeCommands.size > 0) return;
  let inspected: Awaited<ReturnType<typeof inspectPendingFiles>>;
  try {
    inspected = await inspectPendingFiles();
  } catch (error) {
    console.log(`[Mutation] Receipt pruning skipped: ${String(error)}`);
    return;
  }
  if (inspected.corrupt.length > 0 || activeCommands.size > 0) return;
  await pruneSettledReceipts(
    db,
    inspected.valid.map((record) => record.commandId),
  );
}

export async function reconcilePendingMutations(
  db: SQLite.Database,
): Promise<PendingMutation[]> {
  pendingDatabase = db;
  const generation = ++inspectionVersion;
  setPendingState({ ...getPendingState(), checking: true });
  try {
    const inspected = await inspectPendingFiles();
    const unresolved: PendingMutation[] = [];
    const issues: PendingIssueSummary[] = [...inspected.corrupt];
    let runningCount = 0;
    let cleanupWarningCount = 0;
    let failedCleanupCount = 0;
    for (const record of inspected.valid) {
      if (activeCommands.has(record.commandId)) {
        runningCount++;
        continue;
      }
      if (knownFailedCommands.has(record.commandId)) {
        const cleanup = await clearPendingMutation(record.commandId);
        if (cleanup.status === "failed") {
          failedCleanupCount++;
          issues.push({
            id: `${record.commandId}.json`,
            commandId: record.commandId,
            kind: "failed_cleanup",
            recoverable: false,
          });
        } else {
          knownFailedCommands.delete(record.commandId);
        }
        continue;
      }
      const receipt = await findReceipt(db, record);
      if (receipt) {
        const cleanup = await clearPendingMutation(record.commandId);
        if (cleanup.status === "failed") {
          cleanupWarningCount++;
          issues.push({
            id: `${record.commandId}.json`,
            commandId: record.commandId,
            kind: "committed_cleanup_failed",
            recoverable: false,
          });
        }
      } else {
        unresolved.push(record);
        issues.push({
          id: `${record.commandId}.json`,
          commandId: record.commandId,
          kind: "uncommitted",
          recoverable: false,
        });
      }
    }
    if (generation === inspectionVersion)
      setPendingState({
        unresolvedCount: unresolved.length,
        recoverableCount: 0,
        corruptCount: inspected.corrupt.length,
        runningCount,
        cleanupWarningCount,
        failedCleanupCount,
        checking: false,
        issues,
        lastError: null,
      });
    return unresolved;
  } catch (error) {
    if (generation === inspectionVersion)
      setPendingState({
        unresolvedCount: 1,
        recoverableCount: 0,
        corruptCount: 0,
        checking: false,
        issues: [
          {
            id: "storage",
            commandId: null,
            kind: "storage",
            recoverable: false,
          },
        ],
        lastError: error instanceof Error ? error.message : String(error),
      });
    throw error;
  }
}

/**
 * Best-effort cleanup retry kept for compatibility with recovery tooling.
 * Records without receipts are never removed here: another instance may still
 * be committing them. The production UI intentionally exposes only recheck,
 * read-only browsing and corrupt-file quarantine.
 */
export async function resolveUncommittedPendingMutations(
  db: SQLite.Database,
): Promise<number> {
  const inspected = await inspectPendingFiles();
  if (inspected.corrupt.length > 0) {
    throw new Error("存在损坏的待决记录，请先隔离损坏记录");
  }
  let cleared = 0;
  for (const record of inspected.valid) {
    const receipt = await findReceipt(db, record);
    if (!receipt) {
      // Different session IDs and elapsed time do not prove the writer has stopped.
      throw new Error(
        "尚无提交凭据，无法证明原操作已停止；请结束其他运行实例后重新核对，不能自动解除。",
      );
    }
    const cleanup = await clearPendingMutation(record.commandId);
    if (cleanup.status === "failed")
      throw new Error(cleanup.error ?? "待决文件清理失败");
    cleared++;
  }
  await refreshPendingState();
  return cleared;
}

/** Preserve corrupt journals for diagnosis while moving them out of the active .json set. */
export async function quarantineCorruptPendingMutations(): Promise<number> {
  const inspected = await inspectPendingFiles();
  let moved = 0;
  for (const issue of inspected.corrupt) {
    const source = `${PENDING_DIR}/${issue.id}`;
    const target = `${PENDING_DIR}/${issue.id}.corrupt-${Date.now()}-${UUID.string()}`;
    await FileManager.rename(source, target);
    moved++;
  }
  await refreshPendingState();
  return moved;
}

export function buildCategoryMutationPayload(input: {
  id?: string | null;
  name?: string | null;
  icon?: string | null;
}) {
  return {
    id: input.id ?? null,
    name: input.name?.trim() || null,
    icon: input.icon || null,
  };
}

export function buildTagMutationPayload(input: {
  id?: string | null;
  name?: string | null;
  color?: string | null;
}) {
  return {
    id: input.id ?? null,
    name: input.name?.trim() || null,
    color: input.color || null,
  };
}
