import { Path } from "scripting";
import { TRUSTED_SCHEMA_SQL } from "./schema";
import { inspectMetadataTable } from "./metadata-schema";
import {
  assertItemRecord,
  assertMoneyRecord,
  assertExitRecord,
  normalizeEntityName,
  safeAddMinor,
} from "../domain/validation";
import { calculateCostSummary } from "../domain/cost";
import {
  BOUNDED_PAGE_SIZE,
  backupIdentifier,
  existsInBackup,
  scanBounded,
  type BackupRow,
} from "./backup-read";
import type {
  ItemRecord,
  MoneyEntryRecord,
  ItemExitRecord,
} from "../models/types";
import {
  ASSET_BLOBS_DDL,
  ASSET_BLOBS_TABLE,
  BACKUP_DOCUMENT_DDL,
  BACKUP_DOCUMENT_TABLE,
  BACKUP_RECEIPT_KIND as RECEIPT_KIND,
  MAX_LIVE_VERSION,
  SNAPSHOT,
  SNAPSHOT_USER_VERSIONS,
  type SnapshotKeyGroup,
} from "./backup-format";
import {
  blobCompletenessViolation,
  readBackupDocument,
  scanAssetBlobs,
  tableExists,
} from "./backup-blob";

/**
 * Key groups of the trusted snapshot profile. Exported for the restore
 * harnesses; the whitelist itself lives in `backup-format.ts`.
 */
export const BACKUP_TARGET_KEYS = SNAPSHOT.targetKeys;

/**
 * Restore-contract checks shared with the staging capture: a snapshot must
 * declare exactly `user_version = 2` (a live source may still predate the
 * marker) and no unfinished condition check may exist. Hoisted into validation
 * so an unusable backup is refused while another file can still be picked,
 * instead of after the session already ended.
 */
async function assertBackupContract(
  db: SQLite.Database,
  requireVersion: boolean,
): Promise<void> {
  const versions = await db.fetchAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const version = Number(versions[0]?.user_version);
  if (
    !Number.isSafeInteger(version) ||
    (requireVersion
      ? !SNAPSHOT_USER_VERSIONS.includes(version)
      : version < 0 || version > MAX_LIVE_VERSION)
  )
    throw new Error("备份数据库版本不受支持");
  if ((await db.fetchAll("SELECT 1 FROM cas_check LIMIT 1")).length !== 0)
    throw new Error("备份包含未完成的条件检查");
}

/**
 * Proves the rows satisfy the trusted key groups themselves. GROUP BY keeps the
 * result to at most one row instead of materializing a key set in JavaScript,
 * and COLLATE BINARY matches the trusted UNIQUE indexes. The typeof guard
 * rejects a key value the trusted NOT NULL/TEXT column would refuse on insert.
 */
async function auditTargetKeys(
  db: SQLite.Database,
  targetKeys: Readonly<Record<string, readonly SnapshotKeyGroup[]>>,
): Promise<void> {
  for (const [table, keys] of Object.entries(targetKeys)) {
    const name = backupIdentifier(table);
    for (const key of keys) {
      const columns = key.columns.map((column) => backupIdentifier(column));
      const invalid = await db.fetchAll(
        `SELECT 1 AS hit FROM ${name} WHERE ${columns
          .map((column) => `${column} IS NULL OR typeof(${column}) <> 'text'`)
          .join(" OR ")} LIMIT 1`,
      );
      if (invalid.length)
        throw new Error(`备份键约束校验失败：${name}，${key.label}必须为非空文本`);
      const duplicate = await db.fetchAll(
        `SELECT 1 AS hit FROM ${name} GROUP BY ${columns
          .map((column) => `${column} COLLATE BINARY`)
          .join(",")} HAVING count(*) > 1 LIMIT 1`,
      );
      if (duplicate.length)
        throw new Error(`备份键约束校验失败：${name}，${key.label}重复`);
    }
  }
}

/**
 * The trusted schema declares these references, but an untrusted table may omit
 * the FOREIGN KEY clauses that `PRAGMA foreign_key_check` relies on. The target
 * rows are checked directly so a missing parent is refused even when the source
 * schema is silent.
 */
async function auditTargetReferences(db: SQLite.Database): Promise<void> {
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM items i WHERE i.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = i.category_id) LIMIT 1",
    )
  )
    throw new Error("备份领域校验失败：items，所属分类不存在");
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM item_tags t WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = t.item_id) LIMIT 1",
    )
  )
    throw new Error("备份领域校验失败：item_tags，所属物品不存在");
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM item_tags t WHERE NOT EXISTS (SELECT 1 FROM tags g WHERE g.id = t.tag_id) LIMIT 1",
    )
  )
    throw new Error("备份领域校验失败：item_tags，标签不存在");
}

/**
 * A snapshot always carries the blob store and the format document; a live
 * database carries the blob store only. Anything else is an obsolete full
 * backup shape (the ZIP `data.sqlite` generation) and is refused here, before
 * its objects could be misread as the current whitelist.
 */
async function assertSnapshotObjects(
  db: SQLite.Database,
  requireDocument: boolean,
): Promise<void> {
  if (!(await tableExists(db, ASSET_BLOBS_TABLE)))
    throw new Error(
      "备份为旧版格式，当前版本仅支持 SQLite v2 单文件备份（.itemory）",
    );
  if (requireDocument && !(await tableExists(db, BACKUP_DOCUMENT_TABLE)))
    throw new Error("备份缺少格式标记，不能确认是当前版本的备份");
}

/**
 * Blob-aware snapshot audit for v2: 1:1 coverage with `assets`, bounded and
 * complete row walk, per-row type/size/digest/PNG checks and the embedded
 * format/settings document. Runs before any user confirmation.
 */
async function auditSnapshotBlobs(
  db: SQLite.Database,
  requireDocument: boolean,
): Promise<void> {
  if (requireDocument) {
    const violation = await blobCompletenessViolation(db, existsInBackup);
    if (violation) throw new Error(violation);
  }
  const sizes = await db.fetchAll<{ total: number; rows: number }>(
    "SELECT count(*) AS rows, coalesce(sum(byte_size),0) AS total FROM asset_blobs",
  );
  const declaredRows = Number(sizes[0]?.rows);
  const declaredTotal = Number(sizes[0]?.total);
  if (!Number.isSafeInteger(declaredRows) || !Number.isSafeInteger(declaredTotal))
    throw new Error("备份封面登记无效");
  const scanned = await scanAssetBlobs(db, () => undefined);
  if (scanned.count !== declaredRows || scanned.totalBytes !== declaredTotal)
    throw new Error("备份封面数据读取不完整");
  if (requireDocument) {
    const document = await readBackupDocument(db);
    if (document.createdAt <= 0) throw new Error("备份创建时间无效");
  }
}

/**
 * Validates a snapshot (or a live source) against the single trusted profile.
 * A snapshot input must embed the format document and declare `user_version=2`;
 * a live source only has to stay inside the supported range.
 */
export async function validateBackupDatabase(
  db: SQLite.Database,
  options: {
    /**
     * A restore input must embed the format document. Live sources do not have
     * one; the default follows the objects actually present so both cases keep
     * their precise diagnostics.
     */
    requireDocument?: boolean;
    /**
     * Snapshot inputs must declare the exact generation version; a live source
     * only has to stay within the supported range (it may predate the marker).
     */
    requireVersion?: boolean;
  } = {},
): Promise<void> {
  const integrity = await db.fetchAll<{ integrity_check: string }>(
    "PRAGMA integrity_check",
  );
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new Error("数据库完整性校验失败");
  if (!await inspectMetadataTable(db)) throw new Error("备份表结构不兼容：缺少当前元数据表");
  const requireDocument =
    options.requireDocument ?? (await tableExists(db, BACKUP_DOCUMENT_TABLE));
  const requireVersion = options.requireVersion ?? requireDocument;
  await assertSnapshotObjects(db, requireDocument);
  const tables = tableSet(requireDocument);
  const targetKeys: Record<string, readonly SnapshotKeyGroup[]> = { ...SNAPSHOT.targetKeys };
  if (!requireDocument) delete targetKeys[BACKUP_DOCUMENT_TABLE];
  const mismatch = await schemaViolation(db, tables);
  if (mismatch) throw new Error(mismatch);
  await assertBackupContract(db, requireVersion);
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM items WHERE cover_asset_id IS NOT NULL AND cover_asset_id NOT IN (SELECT id FROM assets) LIMIT 1",
    )
  )
    throw new Error("备份封面引用不完整");
  await auditBackupDomain(db, tables);
  // Key and reference rules run after the per-row domain checks so a bad value
  // keeps its precise diagnostic; a key-only defect (missing PRIMARY KEY/UNIQUE
  // in the untrusted source) is still refused here, before confirmation.
  await auditTargetKeys(db, targetKeys);
  await auditTargetReferences(db);
  await auditSnapshotBlobs(db, requireDocument);
  // A backup must never carry restore control state, in either generation.
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM mutation_receipts WHERE kind=? LIMIT 1",
      [RECEIPT_KIND],
    )
  )
    throw new Error("备份包含未完成恢复凭据");
  // Final backstop for any declared foreign key the explicit rules above do not
  // enumerate. It runs last because an untrusted parent table that lost its key
  // makes SQLite report a schema mismatch instead of the precise key rejection.
  if (await existsInBackup(db, "SELECT 1 FROM pragma_foreign_key_check LIMIT 1"))
    throw new Error("备份存在断开的外键关联");
}

function itemRecord(row: BackupRow): ItemRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    categoryId: row.category_id as string | null,
    acquiredOn: row.acquired_on as string,
    acquisitionAmountMinor: row.acquisition_amount_minor as number | null,
    holdingCondition: row.holding_condition as ItemRecord["holdingCondition"],
    iconSymbol: row.icon_symbol as string | null,
    coverAssetId: row.cover_asset_id as string | null,
    channel: row.channel as string | null,
    warrantyUntil: row.warranty_until as string | null,
    valuationMinor: row.valuation_minor as number | null,
    notes: row.notes as string | null,
    revision: row.revision as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function moneyRecord(row: BackupRow): MoneyEntryRecord {
  return {
    id: row.id as string,
    itemId: row.item_id as string,
    direction: row.direction as MoneyEntryRecord["direction"],
    kind: row.kind as MoneyEntryRecord["kind"],
    amountMinor: row.amount_minor as number,
    occurredOn: row.occurred_on as string,
    title: row.title as string,
    note: row.note as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function exitRecord(row: BackupRow): ItemExitRecord {
  return {
    itemId: row.item_id as string,
    reason: row.reason as ItemExitRecord["reason"],
    exitedOn: row.exited_on as string,
    recoveryAmountMinor: row.recovery_amount_minor as number | null,
    note: row.note as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

/**
 * Money/exits are folded into the item that owns them without ever holding a
 * record list: per-direction running totals are kept per item (two integers),
 * and at most two synthetic rows carry those totals back into the domain
 * function so its exact overflow, net-cost, holding-day and daily-cost rules
 * run unchanged.
 */
function compactMoneyEntries(
  item: ItemRecord,
  aggregate: { expense: number; income: number },
): MoneyEntryRecord[] {
  const shared = {
    itemId: item.id,
    kind: "other" as const,
    occurredOn: item.acquiredOn,
    note: null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  const entries: MoneyEntryRecord[] = [];
  // amountMinor must stay strictly positive, so a zero direction is omitted.
  if (aggregate.expense > 0)
    entries.push({
      ...shared,
      id: "audit:expense",
      direction: "expense",
      amountMinor: aggregate.expense,
      title: "累计支出",
    });
  if (aggregate.income > 0)
    entries.push({
      ...shared,
      id: "audit:income",
      direction: "income",
      amountMinor: aggregate.income,
      title: "累计收入",
    });
  return entries;
}

// Read-only audit. Diagnostics identify a table/ordinal and field, never names,
// IDs, notes, dates or amounts from an untrusted/private backup.
async function auditBackupDomain(
  db: SQLite.Database,
  tables: Readonly<Record<string, readonly string[]>>,
): Promise<void> {
  function check(scope: string, work: () => void): void {
    try {
      work();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "记录字段无效";
      // Only messages from our validators are exposed; all supplied values stay private.
      throw new Error(`备份领域校验失败：${scope}，${detail}`);
    }
  }
  function text(value: unknown, field: string): void {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`${field}无效`);
  }
  function integer(value: unknown, field: string): void {
    if (!Number.isSafeInteger(value)) throw new Error(`${field}必须为安全整数`);
  }

  // Small reference tables: one bounded page at a time, never SELECT *.
  for (const table of [
    "categories",
    "tags",
    "assets",
    "mutation_receipts",
  ] as const) {
    await scanBounded(db, {
      table,
      columns: tables[table],
      cursorKey: table === "mutation_receipts" ? "command_id" : "id",
      scope: table,
      onRow(row, ordinal) {
        check(`${table} 第 ${ordinal} 条`, () => {
          text(
            table === "mutation_receipts" ? row.command_id : row.id,
            "记录标识",
          );
          if (table === "categories" || table === "tags") {
            text(row.name, "名称");
            const { normalizedName } = normalizeEntityName(row.name as string);
            if (row.normalized_name !== normalizedName)
              throw new Error("规范名称与名称不一致");
            integer(row.sort_order, "排序值");
            text(row[table === "categories" ? "icon" : "color"], "显示属性");
            if (
              table === "categories" &&
              row.is_system !== 0 &&
              row.is_system !== 1
            )
              throw new Error("系统分类标记无效");
            return;
          }
          integer(row.created_at, "创建时间");
          if (table === "assets") {
            if (
              typeof row.id !== "string" ||
              !/^[A-Za-z0-9-]+\.png$/.test(row.id) ||
              row.relative_path !== row.id ||
              row.mime !== "image/png"
            )
              throw new Error("封面资源路径或类型无效");
            integer(row.byte_size, "文件大小");
            if ((row.byte_size as number) < 0)
              throw new Error("文件大小不能为负数");
            return;
          }
          text(row.kind, "命令类型");
          text(row.payload_hash, "命令摘要");
          // result_id may be empty for successful commands without a result.
          if (typeof row.result_id !== "string")
            throw new Error("命令结果标识无效");
        });
      },
    });
    // Duplicate normalized names are enforced by BACKUP_TARGET_KEYS after this
    // per-row pass: a mismatched key keeps its precise row diagnostic, while a
    // source table that lost its UNIQUE clause is still refused.
  }

  // Referential existence is answered by SQL for the whole table, so entries
  // that point outside the item table are rejected without an item map.
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM money_entries m WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = m.item_id) LIMIT 1",
    )
  )
    throw new Error("备份领域校验失败：money_entries，所属物品不存在");
  if (
    await existsInBackup(
      db,
      "SELECT 1 FROM item_exits e WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = e.item_id) LIMIT 1",
    )
  )
    throw new Error("备份领域校验失败：item_exits，所属物品不存在或退出记录重复");

  // One paged pass over money entries, validating each row and keeping only
  // two running totals per item (never the rows themselves).
  const totals = new Map<string, { expense: number; income: number }>();
  await scanBounded(db, {
    table: "money_entries",
    columns: SNAPSHOT.tables.money_entries,
    cursorKey: "id",
    scope: "money_entries",
    onRow(row, ordinal) {
      const entry = moneyRecord(row);
      check(`money_entries 第 ${ordinal} 条`, () => {
        text(entry.id, "资金标识");
        text(entry.title, "资金标题");
        if (typeof entry.itemId !== "string") throw new Error("所属物品不存在");
        assertMoneyRecord(entry);
        integer(entry.createdAt, "创建时间");
        integer(entry.updatedAt, "更新时间");
      });
      check(`money_entries 第 ${ordinal} 条`, () => {
        const aggregate = totals.get(entry.itemId) ?? { expense: 0, income: 0 };
        // Keep the original checked integer addition and scrubbed diagnostics.
        if (entry.direction === "expense")
          aggregate.expense = safeAddMinor(aggregate.expense, entry.amountMinor, "累计投入");
        else
          aggregate.income = safeAddMinor(aggregate.income, entry.amountMinor, "累计收入");
        totals.set(entry.itemId, aggregate);
      });
    },
  });

  // One paged pass over exits: every row is validated and folded into a slim
  // map, so the items pass needs no per-item host query. Duplicate item ids are
  // rejected here; note is the only unbounded field and is dropped after it has
  // been read (no domain rule reads it back).
  const exitMap = new Map<string, ItemExitRecord>();
  await scanBounded(db, {
    table: "item_exits",
    columns: SNAPSHOT.tables.item_exits,
    cursorKey: "item_id",
    scope: "item_exits",
    onRow(row, ordinal) {
      const exit = exitRecord(row);
      check(`item_exits 第 ${ordinal} 条`, () => {
        if (typeof exit.itemId !== "string") throw new Error("所属物品不存在");
        integer(exit.createdAt, "创建时间");
        integer(exit.updatedAt, "更新时间");
      });
      if (exitMap.has(exit.itemId))
        throw new Error(
          `备份领域校验失败：item_exits 第 ${ordinal} 条，所属物品不存在或退出记录重复`,
        );
      exitMap.set(exit.itemId, { ...exit, note: null });
    },
  });

  // One paged pass over items; each item resolves its own exit and totals.
  await scanBounded(db, {
    table: "items",
    columns: SNAPSHOT.tables.items,
    cursorKey: "id",
    scope: "items",
    onRow(row, ordinal) {
      const item = itemRecord(row);
      check(`items 第 ${ordinal} 条`, () => {
        text(item.id, "物品标识");
        text(item.name, "物品名称");
        assertItemRecord(item);
        integer(item.createdAt, "创建时间");
        integer(item.updatedAt, "更新时间");
      });
      const exit = exitMap.get(item.id) ?? null;
      check(`items 第 ${ordinal} 条`, () => {
        if (exit) assertExitRecord(exit, item.acquiredOn);
        // calculateCostSummary re-runs the same exit rule, then the exact
        // overflow, net-cost, holding-day and daily-cost rules: null is
        // unknown, zero is known; entries may precede acquisition or settle
        // after exit; safe totals only.
        calculateCostSummary(
          item,
          compactMoneyEntries(
            item,
            totals.get(item.id) ?? { expense: 0, income: 0 },
          ),
          exit,
        );
      });
    },
  });
}
const SOURCE_SCHEMA = "backup_source";
/** Bounded release attempts: a pooled reader may still be ending a statement. */
const DETACH_ATTEMPTS = 3;

/**
 * One handle shape for every database this module opens: a single reader next
 * to the writer keeps the pool small, and the default rollback journal leaves no
 * `-wal`/`-shm` sidecar behind the snapshot.
 */
function destinationHandle(path: string): SQLite.Database {
  return SQLite.open(path, {
    foreignKeysEnabled: true,
    readonly: false,
    label: null,
    busyMode: 5,
    journalMode: "default",
    maximumReaderCount: 1,
  });
}

interface SchemaGuard {
  /** Boolean SQL expression over the attached source: true means incompatible. */
  predicate: string;
  message: string;
}

/**
 * Table/column whitelist checked inside the same transaction as the copy, so a
 * schema change between the earlier validation and the copy cannot drop an
 * unknown table or column silently. Both guards run on the writer connection
 * that also attached the source.
 */
function schemaGuards(
  tables: Readonly<Record<string, readonly string[]>>,
): SchemaGuard[] {
  const allowedNames = Object.keys(tables)
    .map((name) => `'${backupIdentifier(name)}'`)
    .join(",");
  const guards: SchemaGuard[] = [
    {
      // Only tables/views are in scope: source indexes and triggers are never
      // installed, so they must not be rejected (same rule as validation).
      predicate: `EXISTS (SELECT 1 FROM ${SOURCE_SCHEMA}.sqlite_master m WHERE m.type IN ('table','view') AND m.name NOT GLOB 'sqlite_*' AND (m.type <> 'table' OR m.name NOT IN (${allowedNames}) OR m.sql LIKE 'CREATE VIRTUAL%'))`,
      message: "备份含未知表或视图，不能保证完整恢复",
    },
  ];
  for (const [table, columns] of Object.entries(tables)) {
    const allowed = columns
      .map((column) => `'${backupIdentifier(column)}'`)
      .join(",");
    guards.push({
      predicate: `((SELECT count(*) FROM pragma_table_info('${backupIdentifier(table)}','${SOURCE_SCHEMA}')) <> ${columns.length} OR EXISTS (SELECT 1 FROM pragma_table_info('${backupIdentifier(table)}','${SOURCE_SCHEMA}') WHERE name NOT IN (${allowed})))`,
      message: `备份表结构不兼容：${table}`,
    });
  }
  return guards;
}

/** Probe only; a minimal SQLite build may omit table-valued pragma functions. */
async function pragmaFunctionsAvailable(
  db: SQLite.Database,
): Promise<boolean> {
  try {
    await db.fetchAll("SELECT 1 FROM pragma_table_info('sqlite_schema') LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Table/column whitelist compared on the database's own main schema. Used by
 * the validation and to explain a failed copy through the caller's source
 * handle; it never depends on an ATTACHed schema (Scripting may serve fetchAll
 * from a pooled reader connection that has no attachment).
 */
/**
 * The portable v2 snapshot carries `backup_document`; a live database carries
 * the blob store but never the backup-only document. Validation therefore uses
 * the object set that applies to the input at hand.
 */
function tableSet(
  includeDocument: boolean,
): Readonly<Record<string, readonly string[]>> {
  if (includeDocument) return SNAPSHOT.tables;
  const tables: Record<string, readonly string[]> = { ...SNAPSHOT.tables };
  delete tables[BACKUP_DOCUMENT_TABLE];
  return tables;
}

async function schemaViolation(
  db: SQLite.Database,
  tables: Readonly<Record<string, readonly string[]>>,
): Promise<string | null> {
  const objects = await db.fetchAll<{
    name: string;
    type: string;
    sql: string | null;
  }>(
    "SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*'",
  );
  for (const object of objects) {
    if (
      object.type !== "table" ||
      !Object.prototype.hasOwnProperty.call(tables, object.name) ||
      (object.sql ?? "").startsWith("CREATE VIRTUAL")
    )
      return "备份含未知表或视图，不能保证完整恢复";
  }
  for (const [table, columns] of Object.entries(tables)) {
    const info = await db.fetchAll<{ name: string }>(
      `PRAGMA table_info(${backupIdentifier(table)})`,
    );
    if (
      info.length !== columns.length ||
      columns.some((column) => !info.some((row) => row.name === column))
    )
      return `备份表结构不兼容：${table}`;
  }
  return null;
}

async function mainDatabasePath(source: SQLite.Database): Promise<string> {
  const rows = await source.fetchAll<{ seq: number; name: string; file: string | null }>(
    "PRAGMA database_list",
  );
  const main =
    rows.find((row) => row.name === "main") ?? rows.find((row) => row.seq === 0);
  // An in-memory source has no file to snapshot atomically through ATTACH and a
  // paged re-read could mix two states, so it is rejected instead of guessed.
  if (!main || typeof main.file !== "string" || !main.file)
    throw new Error("备份源未落盘，无法建立一致快照");
  return main.file;
}

function samePath(left: string, right: string): boolean {
  try {
    return Path.normalize(left) === Path.normalize(right);
  } catch {
    return left === right;
  }
}

/**
 * Copies the source into a fresh trusted database.
 *
 * Scripting's bridge has no cursor and no backup API, so a table-row walk in
 * JavaScript would either materialize the whole database or read each table in
 * separate statements that can observe different states. Instead the source
 * file is ATTACHed and every table is copied with
 * `INSERT INTO main.<table> SELECT <columns> FROM backup_source.<table>` inside
 * one step-array transaction: the first read pins a single source snapshot, all
 * tables come from that snapshot, and the destination either receives every row
 * or nothing. Triggers and views of the untrusted source are never installed.
 *
 * The ATTACH is the first transaction step, not a separate execute: the host may
 * serve execute and fetchAll from different pooled connections, so an attach
 * made outside would be invisible to the transaction's writer connection (and
 * an attach made on a reader would be invisible to the copy). The transaction
 * stays `deferred` on purpose: an immediate one takes a write lock on every
 * attached schema and would block the live database.
 */
export async function cloneBackupDatabase(
  source: SQLite.Database,
  destination: string,
): Promise<SQLite.Database> {
  await copySnapshot(source, destination);
  // The copying handle is deliberately not handed out. It is the only handle
  // that ever saw the ATTACH, and re-opening the payload proves the destination
  // is a standalone file (no attached schema, no borrowed connection) that the
  // caller can write to on its own.
  const db = destinationHandle(destination);
  const schemas = await db.fetchAll<{ name: string }>("PRAGMA database_list");
  const attached = schemas.filter(
    (schema) => schema.name !== "main" && schema.name !== "temp",
  );
  if (attached.length)
    throw new Error(
      `备份目标不是独立数据库文件：${attached.map((schema) => schema.name).join(",")}`,
    );
  return db;
}

/** Builds the payload on a short lived handle; see `cloneBackupDatabase`. */
async function copySnapshot(
  source: SQLite.Database,
  destination: string,
): Promise<void> {
  await validateBackupDatabase(source);
  const sourcePath = await mainDatabasePath(source);
  if (samePath(sourcePath, destination))
    throw new Error("备份目标不能覆盖源数据库");
  // The production caller always uses a new temporary payload path; refusing an
  // existing file also keeps an aliased/hard-linked path from re-opening (and
  // then writing into) the live database.
  if (await FileManager.exists(destination))
    throw new Error("备份目标文件已存在，已取消复制");
  const db = destinationHandle(destination);
  const existing = await db.fetchAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*' LIMIT 1",
  );
  if (existing.length) throw new Error("备份目标文件已存在，已取消复制");
  await createSnapshotSchema(db);
  // The in-transaction column guard needs pragma table-valued functions. When
  // they are missing the whitelist cannot be proven on the copy snapshot, so
  // the clone fails closed instead of copying under a weaker check.
  if (!(await pragmaFunctionsAvailable(db)))
    throw new Error("备份复制不可用：当前 SQLite 不支持备份结构校验");
  const steps: SQLite.TransactionStep[] = [];
  // Scripting may serve execute and fetchAll from different pooled connections,
  // so the ATTACH is the first step of the copy transaction: the attach, the
  // guards and every INSERT ... SELECT then share one writer transaction and
  // one source snapshot. Nothing outside this transaction reads backup_source.
  steps.push({
    sql: `ATTACH DATABASE ? AS ${SOURCE_SCHEMA}`,
    args: [sourcePath],
  });
  // Guard rows violate cas_check(ok = 1) and abort the whole transaction;
  // cas_check itself is never copied, so the destination keeps it empty.
  for (const guard of schemaGuards(tableSet(false)))
    steps.push({ sql: `INSERT INTO main.cas_check(ok) SELECT 0 WHERE ${guard.predicate}` });
  // Live-v2 -> v2: the authoritative cover bytes are pinned in the same
  // transaction as `assets`/`items`, so the copy describes exactly one database
  // state. Reading them later through the caller's handle would mix two
  // states (a cover replaced, re-registered or deleted between the copy and the
  // byte read), so no BLOB is ever re-read after this transaction. Orphan blob
  // rows (no matching asset row in the same snapshot) are not part of the
  // snapshot contract and are left behind, exactly as the byte writer always
  // did. A live source without blob bytes is refused by the writer instead of
  // being completed from the derived cover files.
  const copyOrder = SNAPSHOT.insertOrder.filter(
    (table) => table !== BACKUP_DOCUMENT_TABLE,
  );
  for (const table of copyOrder) {
    const columns = SNAPSHOT.tables[table]
      .map((column) => backupIdentifier(column))
      .join(",");
    steps.push({
      sql:
        `INSERT INTO main.${table}(${columns}) SELECT ${columns} FROM ${SOURCE_SCHEMA}.${table}` +
        (table === ASSET_BLOBS_TABLE
          ? ` WHERE EXISTS (SELECT 1 FROM ${SOURCE_SCHEMA}.assets a WHERE a.id = ${SOURCE_SCHEMA}.${ASSET_BLOBS_TABLE}.asset_id)`
          : ""),
    });
  }
  try {
    await db.transaction(steps, { kind: "deferred" });
  } catch (error) {
    // The attachment survives a rollback, so it is released before the copy
    // error is reported; a rollback path spends the same verified release as a
    // committed one instead of dropping the source lock on the floor.
    const released = await releaseSourceSchema(db);
    const detail = error instanceof Error ? error.message : String(error);
    // Diagnostics use the caller's source handle and its ordinary main schema,
    // never the attached schema of a possibly different reader connection.
    let changed: string | null = null;
    try {
      changed = await schemaViolation(source, tableSet(false));
    } catch {
      changed = null;
    }
    // A guard trip means the source schema moved after the validation.
    throw new Error(
      (changed ?? `备份复制失败：${detail}`) +
        (released ? "" : "（源数据库连接未释放）"),
    );
  }
  // The commit ends the snapshot, not the attachment: DETACH is the only step
  // that gives the source file back, and an unverified release would leave the
  // live database locked behind a pooled connection. `required` makes a failed
  // release fail the export instead of returning a snapshot nobody can replace.
  await releaseSourceSchema(db, true);
  // Deliberately no validation through this handle: it is scoped to the copy
  // and `cloneBackupDatabase` validates the re-opened standalone payload.
}

/**
 * True when this handle still exposes the attached source schema.
 *
 * `strict` asks the writer connection, the only connection that can hold the
 * ATTACH. `execute`/`fetchAll` may be served by a pooled reader that never
 * issued the ATTACH, so their view alone proves nothing; a transaction step is
 * pinned to the writer, and `cas_check(ok = 1)` aborts that transaction exactly
 * when `backup_source` is still listed on that connection. Without table-valued
 * pragma functions the plain `PRAGMA database_list` read is the best evidence
 * available (the copy itself already fails closed in that build).
 */
async function sourceSchemaAttached(
  db: SQLite.Database,
  strict: boolean,
): Promise<boolean> {
  if (!strict) {
    const schemas = await db.fetchAll<{ name: string }>("PRAGMA database_list");
    return schemas.some((schema) => schema.name === SOURCE_SCHEMA);
  }
  try {
    await db.transaction(
      [
        {
          sql: `INSERT INTO main.cas_check(ok) SELECT 0 WHERE EXISTS (SELECT 1 FROM pragma_database_list WHERE name = '${SOURCE_SCHEMA}')`,
        },
      ],
      { kind: "deferred" },
    );
    return false;
  } catch {
    return true;
  }
}

/** Probe only: `pragma_database_list` arrived with `pragma_table_info`. */
async function databaseListFunctionAvailable(
  db: SQLite.Database,
): Promise<boolean> {
  try {
    await db.fetchAll("SELECT 1 FROM pragma_database_list LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Gives the source file back and proves it.
 *
 * A single `DETACH DATABASE` is not enough on the Scripting bridge: the host may
 * answer it from a pooled reader ("no such database"), and a writer that still
 * has a statement open on the attached schema fails it with "database
 * backup_source is locked" right after a successful commit. Both leave the
 * attachment and the source lock alive, so the statement result is never
 * trusted — every attempt is followed by `sourceSchemaAttached`, and the
 * unattached state is attempted twice per round: the plain statement, then the
 * same DETACH as a single writer-pinned transaction step (SQLite builds that
 * refuse a DETACH inside a transaction throw there, and the next round retries
 * the plain form). The caller decides whether an unreleased source is fatal.
 */
async function releaseSourceSchema(
  db: SQLite.Database,
  required = false,
): Promise<boolean> {
  const strict = await databaseListFunctionAvailable(db);
  let detail = "无可用的释放语句";
  for (let attempt = 0; attempt < DETACH_ATTEMPTS; attempt += 1) {
    if (!(await sourceSchemaAttached(db, strict))) return true;
    for (const release of [
      // The writer-pinned form goes first: on the Scripting bridge `execute`
      // itself runs inside a transaction, so a DETACH sent that way is rejected
      // every time ("cannot detach database within transaction" / "database
      // backup_source is locked"). A deferred transaction whose only step is the
      // DETACH touches no attached schema before the statement, which is the
      // documented condition under which SQLite detaches an attached file.
      () =>
        db.transaction([{ sql: `DETACH DATABASE ${SOURCE_SCHEMA}` }], {
          kind: "deferred",
        }),
      () => db.execute(`DETACH DATABASE ${SOURCE_SCHEMA}`),
    ]) {
      try {
        await release();
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
      }
      if (!(await sourceSchemaAttached(db, strict))) return true;
    }
  }
  if (required)
    throw new Error(`备份快照未能释放源数据库：${detail}`);
  return false;
}

/** Creates the trusted destination schema of the snapshot generation. */
export async function createSnapshotSchema(db: SQLite.Database): Promise<void> {
  await db.execute(
    `${TRUSTED_SCHEMA_SQL}\n${ASSET_BLOBS_DDL}\n${BACKUP_DOCUMENT_DDL}`,
  );
}

export async function assertPlainFile(
  path: string,
  limit = 32 * 1024 * 1024,
): Promise<void> {
  if ((await FileManager.isLink(path)) || !(await FileManager.isFile(path)))
    throw new Error(`文件无效：${Path.basename(path)}`);
  const size = (await FileManager.stat(path)).size;
  if (!Number.isSafeInteger(size) || size < 0 || size > limit)
    throw new Error("文件大小超过安全限制");
}

export { BOUNDED_PAGE_SIZE };
