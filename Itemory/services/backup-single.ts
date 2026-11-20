/**
 * v2 single-file `.itemory` snapshots: writer, inspector, staging and restore.
 *
 * A v2 snapshot is one self-contained SQLite database: trusted tables plus
 * `asset_blobs` (cover PNG bytes) and `backup_document` (format marker and the
 * embedded settings document). There is no ZIP, no sidecar cover directory and
 * no `records.json`: staging copies the one file, binds it with a logical
 * digest and finalization copies rows with one ATTACH transaction, then derives
 * the cover files the unchanged UI still reads.
 *
 * This module owns the whole backup lifecycle: writer, inspector, staging,
 * crash recovery and completion. Obsolete full-backup shapes (the ZIP payload
 * and the `records.json` staging protocol) are not read any more; a workspace
 * left behind by one of them is kept and refused, never guessed at.
 */
import { Path } from "scripting";
import { COVERS_DIR, DATA_HOME, PREFS_PATH } from "./paths";
import {
  ASSET_BLOBS_DDL,
  ASSET_BLOBS_TABLE,
  BACKUP_DOCUMENT_TABLE,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  DIGEST_PAGE_SIZE,
  MAX_BLOB_TOTAL_BYTES,
  MAX_PREFS_BYTES,
  SNAPSHOT,
  SINGLE_FILE_LIMIT,
  SNAPSHOT_VERSION,
  type BackupInspection,
} from "./backup-format";
import {
  assertBlobBytes,
  assertPrefsText,
  inspectAssetBlobsTable,
  isSha256Hex,
  readBackupDocument,
  scanAssetBlobs,
  sha256Hex,
  toBytes,
  writeBackupDocument,
} from "./backup-blob";
import { assertPlainFile, cloneBackupDatabase, validateBackupDatabase } from "./backup-safe";
import { needsRestartAfterRestore } from "./mutation-coordinator";
import { backupIdentifier } from "./backup-read";
import { APP_METADATA_TABLE, inspectMetadataTable } from "./metadata-schema";
import { TRUSTED_SCHEMA_SQL, ensureDatabaseSchema } from "./schema";
import {
  MANIFEST,
  RECEIPT_KIND,
  RESTORE_WORK,
  SINGLE_SNAPSHOT,
  assertLiveDatabase,
  assertNoPendingFiles,
  cleanupCompleted,
  demand,
  has,
  hashMutationPayload,
  installVerifiedBytes,
  openRestore,
  receipts,
  receiptIdOf,
  removeVerified,
  transaction,
  type ReceiptRow,
} from "./backup-work";

const SINGLE_KIND = "itemory-backup-sqlite";
const SOURCE_SCHEMA = "backup_restore";
const SNAPSHOT_NAME = "snapshot.sqlite";
const PREFERS_LIMIT = MAX_PREFS_BYTES;

// --------------------------------------------------------------- digest ----

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function utf8(text: string): Uint8Array {
  const data = Data.fromRawString(text);
  if (!data) throw new Error("备份摘要生成失败");
  return toBytes(data);
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const data = Data.fromUint8Array(bytes);
  if (!data) throw new Error("备份摘要生成失败");
  return toBytes(Crypto.sha256(data));
}

/**
 * Order-independent per-table paging is avoided on purpose: the digest walks
 * the declared identity columns of the trusted whitelist with a keyset cursor,
 * so a page can never overlap or skip a row and memory stays bounded.
 */
function keyset(
  keys: readonly string[],
  last: SQLite.DatabaseValue[] | null,
): { where: string; args: SQLite.DatabaseValue[] } {
  if (!last) return { where: "", args: [] };
  const clauses: string[] = [];
  const args: SQLite.DatabaseValue[] = [];
  for (let i = 0; i < keys.length; i++) {
    const equal = keys.slice(0, i).map((key) => `${key} = ?`);
    clauses.push(`(${[...equal, `${keys[i]} > ?`].join(" AND ")})`);
    args.push(...last.slice(0, i), last[i]);
  }
  return { where: ` WHERE (${clauses.join(" OR ")})`, args };
}

export interface DatabaseDigest {
  digest: string;
  counts: { items: number; money: number; covers: number };
}

/**
 * Logical digest of the snapshot. For
 * every whitelisted table the canonical row arrays are hashed through a fixed
 * memory hash chain; blob rows contribute their verified size and SHA-256, and
 * the bytes themselves are re-hashed, so a digest match proves the blob content
 * as well as the scalar facts.
 */
export async function digestDatabase(
  db: SQLite.Database,
  options: { receiptId?: string } = {},
): Promise<DatabaseDigest> {
  const profile = SNAPSHOT;
  let acc = sha256Bytes(utf8(`itemory-backup-digest-v${profile.version}`));
  let pending = "";
  const feed = (chunk: string): void => {
    pending += chunk;
    if (pending.length >= 262144) {
      acc = sha256Bytes(concatBytes(acc, utf8(pending)));
      pending = "";
    }
  };
  const counts = { items: 0, money: 0, covers: 0 };
  // Only rows a restore actually copies take part in the digest: `cas_check`
  // is never copied and `backup_document` is bound separately (format guards
  // plus the settings proof), so a live database and its staged snapshot hash
  // the same row set.
  for (const table of profile.insertOrder) {
    const name = backupIdentifier(table);
    const columns = profile.tables[table].map(backupIdentifier);
    const keys = profile.rowKeys[table].map(backupIdentifier);
    feed(JSON.stringify([name]));
    if (table === ASSET_BLOBS_TABLE) {
      // Blob pages hold exactly one row: a multi-row page of `png_bytes` would
      // materialize several covers (and their digests) at once.
      const scanned = await scanAssetBlobs(
        db,
        (row) => {
          feed(JSON.stringify([row.assetId, { size: row.byteSize, sha256: row.sha256 }]));
        },
        { pageSize: 1 },
      );
      counts.covers += scanned.count;
      continue;
    }
    let last: SQLite.DatabaseValue[] | null = null;
    for (;;) {
      const page = keyset(keys, last);
      let rows: Record<string, SQLite.DatabaseValue>[];
      if (table === "mutation_receipts" && options.receiptId) {
        rows = await db.fetchAll<Record<string, SQLite.DatabaseValue>>(
          `SELECT ${columns.join(",")} FROM ${name}` +
            `${page.where ? page.where + " AND" : " WHERE"} NOT (command_id=? AND kind=?)` +
            ` ORDER BY ${keys.join(",")} LIMIT ${DIGEST_PAGE_SIZE}`,
          [...page.args, options.receiptId, RECEIPT_KIND],
        );
      } else {
        rows = await db.fetchAll<Record<string, SQLite.DatabaseValue>>(
          `SELECT ${columns.join(",")} FROM ${name}${page.where}` +
            ` ORDER BY ${keys.join(",")} LIMIT ${DIGEST_PAGE_SIZE}`,
          page.args,
        );
      }
      if (!rows.length) break;
      for (const row of rows) feed(JSON.stringify(columns.map((column) => row[column])));
      if (table === "items") counts.items += rows.length;
      if (table === "money_entries") counts.money += rows.length;
      const lastRow = rows[rows.length - 1];
      last = keys.map((key) => lastRow[key]);
    }
  }
  if (pending) acc = sha256Bytes(concatBytes(acc, utf8(pending)));
  return { digest: hex(acc), counts };
}

// --------------------------------------------------------------- writer ----

async function readPrefsText(): Promise<string | null> {
  if (!(await has(PREFS_PATH))) return null;
  await assertPlainFile(PREFS_PATH, PREFERS_LIMIT);
  const text = await FileManager.readAsString(PREFS_PATH);
  assertPrefsText(text);
  return text;
}

/**
 * Reads one pinned blob row from the snapshot copy. A present row is
 * authoritative: its declared size and digest must match the bytes that were
 * copied inside the clone transaction, otherwise the snapshot would carry
 * corrupt cover data and the export is refused. A missing row is not repaired
 * from any file on this device — the caller fails closed.
 */
async function pinnedBlobBytes(
  snapshot: SQLite.Database,
  assetId: string,
): Promise<Uint8Array | null> {
  const rows = await snapshot.fetchAll<{
    png_bytes: unknown;
    byte_size: unknown;
    sha256: unknown;
  }>(
    `SELECT png_bytes,byte_size,sha256 FROM ${ASSET_BLOBS_TABLE} WHERE asset_id=?`,
    [assetId],
  );
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("备份封面登记重复");
  const row = rows[0];
  if (!isSha256Hex(row.sha256)) throw new Error("备份封面摘要无效");
  if (!Number.isSafeInteger(row.byte_size) || (row.byte_size as number) <= 0)
    throw new Error("备份封面大小无效");
  let bytes: Uint8Array;
  try {
    bytes = toBytes(row.png_bytes);
  } catch {
    throw new Error("备份封面数据无法读取");
  }
  if (!bytes.length || bytes.length !== row.byte_size)
    throw new Error("备份封面大小与内容不一致");
  if (sha256Hex(bytes) !== row.sha256)
    throw new Error("备份封面摘要与内容不一致");
  assertBlobBytes(bytes, "封面");
  return bytes;
}

/**
 * Completes the blob rows of a snapshot.
 *
 * The clone already pinned every `asset_blobs` row in the same ATTACH
 * transaction as `assets`/`items`, so those bytes are verified here and never
 * re-read from the live database: a cover changed or deleted after the copy
 * cannot leak into the snapshot. A missing byte row is a hard failure — there
 * is no source-image fallback any more, so a database whose cover bytes were
 * never stored is refused instead of exporting a snapshot with a cover that
 * only exists on this device.
 */
async function populateSnapshotBlobs(snapshot: SQLite.Database): Promise<void> {
  let total = 0;
  let last: string | null = null;
  for (;;) {
    const rows: { id: string }[] = await snapshot.fetchAll<{ id: string }>(
      "SELECT id FROM assets" + (last ? " WHERE id > ?" : "") + " ORDER BY id LIMIT 16",
      last ? [last] : [],
    );
    if (!rows.length) break;
    for (const row of rows) {
      const bytes = await pinnedBlobBytes(snapshot, row.id);
      if (!bytes) throw new Error("备份封面数据缺失，已停止导出");
      assertBlobBytes(bytes, "封面");
      total += bytes.length;
      if (total > MAX_BLOB_TOTAL_BYTES) throw new Error("备份封面总量超过安全限制");
    }
    last = rows[rows.length - 1].id;
  }
}

/**
 * Builds the single-file snapshot. The destination must not exist. Returns the
 * validated destination path; the caller only shares it after `inspectSingle`.
 */
export async function writeSingleFileSnapshot(
  source: SQLite.Database,
  destination: string,
): Promise<void> {
  await validateBackupDatabase(source);
  const snapshot = await cloneBackupDatabase(source, destination);
  // The generation marker is part of the snapshot contract; the live database
  // may still declare 0 (it predates the marker), snapshot inputs must say 2.
  await snapshot.execute(`PRAGMA user_version=${SNAPSHOT_VERSION}`);
  await populateSnapshotBlobs(snapshot);
  const prefsText = await readPrefsText();
  await writeBackupDocument(snapshot, { createdAt: Date.now(), prefsText });
  await validateBackupDatabase(snapshot, { requireDocument: true });
}

// ------------------------------------------------------------- inspector ----

/** Read-only inspection of a single-file snapshot; never touches live data. */
export async function inspectSingleFileBackup(
  file: string,
): Promise<BackupInspection> {
  try {
    await assertPlainFile(file, SINGLE_FILE_LIMIT);
    const db = openRestore(file, true);
    await validateBackupDatabase(db, { requireDocument: true });
    const counts = await db.fetchAll<{ items: number; money: number; covers: number }>(
      "SELECT (SELECT count(*) FROM items) items,(SELECT count(*) FROM money_entries) money,(SELECT count(*) FROM assets) covers",
    );
    return {
      isValid: true,
      itemCount: Number(counts[0]?.items ?? 0),
      moneyEntryCount: Number(counts[0]?.money ?? 0),
      coverCount: Number(counts[0]?.covers ?? 0),
    };
  } catch (error) {
    return {
      isValid: false,
      itemCount: 0,
      moneyEntryCount: 0,
      coverCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * True when the picked file is a single-file snapshot. A file SQLite cannot
 * open is reported as not-single so the legacy ZIP reader owns the message for
 * old archives; a SQLite file without our format marker is refused later by
 * the inspector (fail closed, never guessed as ZIP).
 */
export async function isSingleFileBackup(file: string): Promise<boolean> {
  await assertPlainFile(file, SINGLE_FILE_LIMIT);
  let db: SQLite.Database;
  try {
    db = openRestore(file, true);
  } catch {
    return false;
  }
  try {
    await db.fetchAll("SELECT name FROM sqlite_master LIMIT 1");
  } catch {
    return false;
  }
  return true;
}

// -------------------------------------------------------------- manifest ----

interface SingleManifest {
  kind: typeof SINGLE_KIND;
  version: typeof SNAPSHOT_VERSION;
  id: string;
  createdAt: number;
  snapshot: { name: string; size: number; digest: string };
  prefs: { size: number; sha256: string } | null;
  counts: { items: number; money: number; covers: number };
  hash: string;
}

function singleManifestHash(value: Omit<SingleManifest, "hash">): string {
  return hashMutationPayload(value);
}

/**
 * A staged workspace must belong to the single-file protocol. Anything else —
 * a manifest without the kind marker (written by the removed `records.json`
 * protocol), an unknown kind, or a workspace that exists without a manifest —
 * is stale work from an obsolete build: it is kept for the user and never
 * resumed, completed or deleted on the strength of a guess.
 */
async function assertStagedWork(): Promise<void> {
  if (!(await has(MANIFEST)))
    throw new Error(
      "恢复暂存来自旧版备份格式，当前版本无法继续；已保留暂存，请重新选择 .itemory 备份",
    );
  const text = await FileManager.readAsString(MANIFEST);
  if (text.length > 1024 * 1024) throw new Error("恢复状态损坏，未允许进入数据");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "恢复暂存来自旧版备份格式，当前版本无法继续；已保留暂存，请重新选择 .itemory 备份",
    );
  }
  const kind = (parsed as { kind?: unknown } | null)?.kind;
  if (kind === undefined || kind === null)
    throw new Error(
      "恢复暂存来自旧版备份格式，当前版本无法继续；已保留暂存，请重新选择 .itemory 备份",
    );
  if (kind !== SINGLE_KIND) throw new Error("恢复状态无法识别，未允许进入数据");
}

async function readSingleWork(): Promise<{
  manifest: SingleManifest;
  prefsText: string | null;
}> {
  demand(await has(MANIFEST), "恢复暂存尚不完整，未允许进入数据；请保留原备份");
  demand(await has(SINGLE_SNAPSHOT), "恢复暂存尚不完整，未允许进入数据；请保留原备份");
  const text = await FileManager.readAsString(MANIFEST);
  if (text.length > 1024 * 1024) throw new Error("恢复状态损坏，未允许进入数据");
  const manifest = JSON.parse(text) as SingleManifest;
  demand(
    manifest &&
      manifest.kind === SINGLE_KIND &&
      manifest.version === SNAPSHOT_VERSION &&
      typeof manifest.id === "string" &&
      /^[A-Fa-f0-9-]{36}$/.test(manifest.id) &&
      Number.isSafeInteger(manifest.createdAt) &&
      manifest.snapshot !== null &&
      typeof manifest.snapshot === "object" &&
      manifest.snapshot.name === SNAPSHOT_NAME &&
      Number.isSafeInteger(manifest.snapshot.size) &&
      manifest.snapshot.size > 0 &&
      manifest.snapshot.size <= SINGLE_FILE_LIMIT &&
      typeof manifest.snapshot.digest === "string" &&
      /^[a-f0-9]{64}$/.test(manifest.snapshot.digest),
    "恢复状态损坏，未允许进入数据",
  );
  const { hash, ...base } = manifest;
  demand(typeof hash === "string" && singleManifestHash(base) === hash, "恢复状态摘要不匹配");
  await assertPlainFile(SINGLE_SNAPSHOT, SINGLE_FILE_LIMIT);
  const size = (await FileManager.stat(SINGLE_SNAPSHOT)).size;
  demand(size === manifest.snapshot.size, "恢复数据大小不匹配");
  const staged = openRestore(SINGLE_SNAPSHOT, true);
  const digest = await digestDatabase(staged);
  demand(digest.digest === manifest.snapshot.digest, "恢复数据摘要不匹配");
  demand(
    digest.counts.items === manifest.counts.items &&
      digest.counts.money === manifest.counts.money &&
      digest.counts.covers === manifest.counts.covers,
    "恢复数据统计不匹配",
  );
  const document = await readBackupDocument(staged);
  const prefsText = document.prefsText;
  if (manifest.prefs === null) demand(prefsText === null, "恢复设置记录不一致");
  else {
    demand(prefsText !== null, "恢复设置缺失");
    const bytes = utf8(prefsText as string);
    demand(
      bytes.length === manifest.prefs.size &&
        sha256Hex(bytes) === manifest.prefs.sha256,
      "恢复设置摘要不匹配",
    );
  }
  return { manifest, prefsText };
}

/** Stages one verified single-file snapshot. No live SQL and no records.json. */
export async function stageSingleFileRestore(file: string): Promise<void> {
  demand(!(await has(RESTORE_WORK)), "已有恢复尚未核对完成，请重新打开 Itemory");
  await assertPlainFile(file, SINGLE_FILE_LIMIT);
  // Every check that can reject the payload runs before restore-work exists.
  const source = openRestore(file, true);
  await validateBackupDatabase(source, { requireDocument: true });
  await FileManager.createDirectory(RESTORE_WORK, true);
  await FileManager.copyFile(file, SINGLE_SNAPSHOT);
  await assertPlainFile(SINGLE_SNAPSHOT, SINGLE_FILE_LIMIT);
  const snapshotSize = (await FileManager.stat(SINGLE_SNAPSHOT)).size;
  // Everything below reads the pinned copy, never the picked file again: the
  // manifest must describe exactly the bytes that will be restored.
  const staged = openRestore(SINGLE_SNAPSHOT, true);
  await validateBackupDatabase(staged, { requireDocument: true });
  const document = await readBackupDocument(staged);
  const counts = await staged.fetchAll<{ items: number; money: number; covers: number }>(
    "SELECT (SELECT count(*) FROM items) items,(SELECT count(*) FROM money_entries) money,(SELECT count(*) FROM assets) covers",
  );
  const digest = await digestDatabase(staged);
  await assertPlainFile(SINGLE_SNAPSHOT, SINGLE_FILE_LIMIT);
  const base: Omit<SingleManifest, "hash"> = {
    kind: SINGLE_KIND,
    version: SNAPSHOT_VERSION,
    id: UUID.string(),
    createdAt: Date.now(),
    snapshot: {
      name: SNAPSHOT_NAME,
      size: snapshotSize,
      digest: digest.digest,
    },
    prefs:
      document.prefsText === null
        ? null
        : {
            size: utf8(document.prefsText).length,
            sha256: sha256Hex(utf8(document.prefsText)),
          },
    counts: {
      items: Number(counts[0]?.items ?? 0),
      money: Number(counts[0]?.money ?? 0),
      covers: Number(counts[0]?.covers ?? 0),
    },
  };
  const manifest: SingleManifest = { ...base, hash: singleManifestHash(base) };
  await FileManager.writeAsString(MANIFEST, JSON.stringify(manifest));
  await readSingleWork(); // Read back before any live data is changed.
}

// --------------------------------------------------------------- restore ----

async function assertTarget(db: SQLite.Database): Promise<void> {
  demand((await inspectMetadataTable(db)) !== null, "当前数据库缺少元数据表，未替换");
  const objects = await db.fetchAll<{ name: string; type: string }>(
    "SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*'",
  );
  const allowed = new Set<string>(
    Object.keys(SNAPSHOT.tables).filter((table) => table !== BACKUP_DOCUMENT_TABLE),
  );
  allowed.add(ASSET_BLOBS_TABLE);
  demand(
    objects.every(
      (row) => row.type === "table" && allowed.has(row.name),
    ),
    "当前数据库含未知结构，未替换",
  );
  demand(
    SNAPSHOT.liveOrder.every((table) =>
      objects.some((row) => row.name === table),
    ),
    "当前数据库结构不完整，未替换",
  );
  const extraColumns: Record<string, readonly string[]> = {
    items: ["acquisition_currency", "valuation_currency"],
    money_entries: ["currency"],
    item_exits: ["recovery_currency"],
  };
  for (const table of SNAPSHOT.liveOrder) {
    const columns = SNAPSHOT.tables[table];
    const info = await db.fetchAll<{ name: string; hidden: number }>(
      `PRAGMA table_xinfo(${backupIdentifier(table)})`,
    );
    demand(
      info.every(
        (row) =>
          !row.hidden &&
          (columns.includes(row.name) ||
            (extraColumns[table] ?? []).includes(row.name)),
      ) && columns.every((name) => info.some((row) => row.name === name)),
      "当前数据库列不兼容，未替换",
    );
  }
  if (objects.some((row) => row.name === ASSET_BLOBS_TABLE))
    demand(await inspectAssetBlobsTable(db), "当前封面数据表结构不兼容，未替换");
  const versions = await db.fetchAll<{ user_version: number }>("PRAGMA user_version");
  const version = Number(versions[0]?.user_version);
  demand(
    Number.isSafeInteger(version) && version >= 0 && version <= SNAPSHOT_VERSION,
    "当前数据库版本不受支持，未替换",
  );
  demand(
    (await db.fetchAll("SELECT 1 FROM cas_check LIMIT 1")).length === 0,
    "当前数据库条件检查尚未完成",
  );
}

async function committedSingle(
  db: SQLite.Database,
  manifest: SingleManifest,
): Promise<"none" | "files-pending" | "complete"> {
  const rows = await receipts(db);
  demand(rows.length <= 1, "存在多个恢复凭据，已停止进入数据");
  if (!rows.length) return "none";
  const row = rows[0];
  demand(
    row.command_id === receiptIdOf(manifest.id) &&
      row.payload_hash === manifest.hash &&
      (row.result_id === "files-pending" || row.result_id === "complete"),
    "恢复提交凭据与暂存记录不一致",
  );
  return row.result_id === "complete" ? "complete" : "files-pending";
}

/**
 * One immediate transaction: source guards (schema whitelist, column sets,
 * format marker) abort through `cas_check`, live rows are replaced from the
 * staged snapshot, the version is pinned to 2 and the control receipt records
 * the SQL commit. `backup_document` is never copied into live data.
 */
function restoreSteps(manifest: SingleManifest): SQLite.TransactionStep[] {
  const steps: SQLite.TransactionStep[] = [
    { sql: `ATTACH DATABASE ? AS ${SOURCE_SCHEMA}`, args: [SINGLE_SNAPSHOT] },
  ];
  const allowedNames = Object.keys(SNAPSHOT.tables)
    .map((name) => `'${backupIdentifier(name)}'`)
    .join(",");
  steps.push({
    sql: `INSERT INTO main.cas_check(ok) SELECT 0 WHERE EXISTS (SELECT 1 FROM ${SOURCE_SCHEMA}.sqlite_master m WHERE m.type IN ('table','view') AND m.name NOT GLOB 'sqlite_*' AND (m.type <> 'table' OR m.name NOT IN (${allowedNames}) OR m.sql LIKE 'CREATE VIRTUAL%'))`,
  });
  for (const [table, columns] of Object.entries(SNAPSHOT.tables)) {
    const name = backupIdentifier(table);
    const allowed = columns.map((column) => `'${backupIdentifier(column)}'`).join(",");
    steps.push({
      sql: `INSERT INTO main.cas_check(ok) SELECT 0 WHERE ((SELECT count(*) FROM pragma_table_info('${name}','${SOURCE_SCHEMA}')) <> ${columns.length} OR EXISTS (SELECT 1 FROM pragma_table_info('${name}','${SOURCE_SCHEMA}') WHERE name NOT IN (${allowed})))`,
    });
  }
  for (const key of ["format", "format_version"]) {
    const expected = key === "format" ? BACKUP_FORMAT : String(BACKUP_FORMAT_VERSION);
    steps.push({
      sql: `INSERT INTO main.cas_check(ok) SELECT 0 WHERE (SELECT count(*) FROM ${SOURCE_SCHEMA}.${BACKUP_DOCUMENT_TABLE} WHERE key='${key}' AND value='${expected}') <> 1`,
    });
  }
  // A live database that predates v2 receives the trusted blob table here; the
  // DDL is the exact live schema text and is idempotent.
  steps.push({ sql: ASSET_BLOBS_DDL });
  for (const table of [
    "money_entries",
    "item_exits",
    "item_tags",
    "items",
    ASSET_BLOBS_TABLE,
    "assets",
    "tags",
    "categories",
    "mutation_receipts",
    "app_metadata",
    "cas_check",
  ])
    steps.push({ sql: `DELETE FROM main.${table}` });
  for (const table of SNAPSHOT.insertOrder) {
    const name = backupIdentifier(table);
    const columns = SNAPSHOT.tables[table]
      .map((column) => backupIdentifier(column))
      .join(",");
    steps.push({
      sql: `INSERT INTO main.${name}(${columns}) SELECT ${columns} FROM ${SOURCE_SCHEMA}.${name}`,
    });
  }
  steps.push({ sql: `PRAGMA user_version=${SNAPSHOT_VERSION}` });
  steps.push({
    sql: "INSERT INTO mutation_receipts(command_id,kind,payload_hash,result_id,created_at) VALUES(?,?,?,'files-pending',?)",
    args: [receiptIdOf(manifest.id), RECEIPT_KIND, manifest.hash, manifest.createdAt],
  });
  return steps;
}

/**
 * v2 备份的封面字节只存在于 `asset_blobs`，恢复时不再把整套封面写回
 * `covers/`（那会让每次恢复都重建一整份可丢弃的派生副本）。这里只做复核与清扫：
 * 1. 每条 BLOB 行的摘要/大小在快照里复核（`scanAssetBlobs`）；
 * 2. 目录里与恢复数据无关的旧文件一律清除（它们属于被替换的数据）；
 * 3. 与恢复数据同名、且字节与库内摘要完全一致的旧副本删除；不一致则保留，
 *    绝不以“恢复”为名删掉未核对的数据。
 */
async function installCovers(manifest: SingleManifest): Promise<void> {
  const staged = openRestore(SINGLE_SNAPSHOT, true);
  const digests = new Map<string, { sha256: string; byteSize: number }>();
  await scanAssetBlobs(staged, async (row) => {
    digests.set(row.assetId, { sha256: row.sha256, byteSize: row.byteSize });
  });
  demand(digests.size === manifest.counts.covers, "恢复封面与登记不一致");
  for (const name of await FileManager.readDirectory(COVERS_DIR)) {
    demand(/^[A-Za-z0-9-]+\.png$/.test(name), "正式封面目录含未知文件，未删除");
    const path = Path.join(COVERS_DIR, name);
    await assertPlainFile(path);
    const known = digests.get(name);
    if (!known) {
      await removeVerified(path);
      continue;
    }
    const bytes = await FileManager.readAsBytes(path);
    if (
      bytes.length === known.byteSize &&
      sha256Hex(bytes) === known.sha256
    )
      await removeVerified(path);
  }
}

/**
 * Completes a staged single-file restore in the next instance. Idempotent: the
 * control receipt, the verified snapshot digest and the rows themselves decide
 * how far a previous launch got, so an interrupted run resumes instead of
 * replaying or silently accepting a partial restore.
 */
export async function finishSingleRestore(): Promise<void> {
  const work = await readSingleWork();
  const fixed = Path.join(DATA_HOME, "data.sqlite");
  let db: SQLite.Database;
  if (await has(fixed)) {
    await assertLiveDatabase(fixed);
    db = openRestore(fixed);
    const prior = await receipts(db);
    if (prior.length === 1 && prior[0].result_id === "complete") {
      // Only the receipt this workspace owns may be cleaned up. A completed
      // receipt from another restore generation/attempt stays untouched and the
      // workspace is kept for inspection instead of being silently mixed.
      demand(
        prior[0].command_id === receiptIdOf(work.manifest.id) &&
          prior[0].payload_hash === work.manifest.hash,
        "恢复提交凭据与暂存记录不一致",
      );
      await assertTarget(db);
      await cleanupCompleted(db, prior[0]);
      return;
    }
  } else {
    demand(await has(MANIFEST), "恢复暂存缺失，不创建替代数据");
    db = openRestore(fixed);
    await db.execute(TRUSTED_SCHEMA_SQL);
  }
  const { manifest, prefsText } = work;
  const status = await committedSingle(db, manifest);
  if (status === "none") {
    await assertTarget(db);
    await assertNoPendingFiles();
    try {
      await transaction(db, restoreSteps(manifest));
    } catch (error) {
      // Do not replay if the native bridge reported an error after commit.
      let confirmed = false;
      try {
        confirmed = (await committedSingle(db, manifest)) === "files-pending";
      } catch {
        /* unknown: keep workspace */
      }
      if (!confirmed)
        throw new Error(
          "数据库恢复失败或结果待核对，暂存已保留；请重新打开 Itemory 核对。" +
            (error instanceof Error ? error.message : ""),
        );
    }
  } else {
    await assertTarget(db);
  }
  demand(
    (await committedSingle(db, manifest)) === "files-pending",
    "恢复提交尚未确认",
  );
  await assertNoPendingFiles();
  const actual = await digestDatabase(db, {
    receiptId: receiptIdOf(manifest.id),
  });
  demand(actual.digest === manifest.snapshot.digest, "恢复后数据库事实不一致，暂存已保留");
  if (await has(COVERS_DIR))
    demand(!(await FileManager.isLink(COVERS_DIR)), "正式封面目录不能为链接");
  await FileManager.createDirectory(COVERS_DIR, true);
  await installCovers(manifest);
  if (prefsText !== null) {
    const bytes = utf8(prefsText);
    await installVerifiedBytes(PREFS_PATH, bytes, {
      name: "prefs.json",
      size: bytes.length,
      hash: sha256Hex(bytes),
    });
  } else if (await has(PREFS_PATH)) {
    await assertPlainFile(PREFS_PATH, PREFERS_LIMIT);
    await removeVerified(PREFS_PATH);
  }
  // Runtime files belong to the replaced data (same rule as the legacy path).
  for (const name of ["drafts", "pending", "exchange-journals"]) {
    const dir = Path.join(DATA_HOME, name);
    if (await has(dir)) {
      demand(!(await FileManager.isLink(dir)), "运行目录不能为链接");
      await removeVerified(dir);
    }
    if (name !== "exchange-journals") await FileManager.createDirectory(dir, true);
  }
  const covers = await digestDatabase(db, {
    receiptId: receiptIdOf(manifest.id),
  });
  demand(covers.digest === manifest.snapshot.digest, "恢复后数据库事实不一致，暂存已保留");
  try {
    await transaction(db, [
      {
        sql: "UPDATE mutation_receipts SET result_id='complete' WHERE command_id=? AND kind=? AND payload_hash=?",
        args: [receiptIdOf(manifest.id), RECEIPT_KIND, manifest.hash],
      },
    ]);
  } catch {
    /* Result must be proven by SQLite, never by a failed file write. */
  }
  demand(
    (await committedSingle(db, manifest)) === "complete",
    "恢复完成状态未确认，暂存已保留",
  );
  const row: ReceiptRow = {
    command_id: receiptIdOf(manifest.id),
    payload_hash: manifest.hash,
    result_id: "complete",
  };
  await cleanupCompleted(db, row);
}

// ------------------------------------------------------ startup recovery ----

/**
 * True only for the states a first launch can be interrupted in: the file SQLite
 * created before any DDL (no object at all) and the metadata table the previous
 * build created as its own step before the schema. Such a file cannot hold a
 * control receipt, which is the only reason "no receipt table" may be read as
 * "no receipt". Every other shape — a trusted table set without
 * `mutation_receipts`, a foreign table, a damaged metadata table — is refused by
 * `inspectMetadataTable` or by the schema owner; it is never guessed at.
 */
async function isFirstInitRemnant(db: SQLite.Database): Promise<boolean> {
  const objects = await db.fetchAll<{ name: string; type: string }>(
    "SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*'",
  );
  if (!objects.length) return true;
  if (
    objects.length !== 1 ||
    objects[0].type !== "table" ||
    objects[0].name !== APP_METADATA_TABLE
  )
    return false;
  return (await inspectMetadataTable(db)) === APP_METADATA_TABLE;
}

/**
 * Before `getDatabase` initializes or seeds anything. A failed recovery blocks
 * the UI: every branch either proves a completed restore, finishes the staged
 * one, or throws. Stale work from the removed v1 protocol is refused instead of
 * being replayed, and is never deleted on a guess.
 */
export async function recoverRestoreAtStartup(): Promise<boolean> {
  demand(!needsRestartAfterRestore(), "请完全退出后再继续恢复核对");
  const fixed = Path.join(DATA_HOME, "data.sqlite");
  // One connection and one receipt read per launch. The live database is only
  // checked for being a plain file (see assertLiveDatabase): no imported-backup
  // size budget applies once the user's own data grows.
  let prior: ReceiptRow[] = [];
  let live: SQLite.Database | null = null;
  let remnant = false;
  if (await has(fixed)) {
    await assertLiveDatabase(fixed);
    live = openRestore(fixed);
    // A launch interrupted before the trusted schema existed has no receipt
    // table; reading it as an SQL error would block startup forever. The
    // structure decides, never the error text of a failed query.
    remnant = await isFirstInitRemnant(live);
    prior = remnant ? [] : await receipts(live);
    if (prior.length === 1 && prior[0].result_id === "complete") {
      await assertTarget(live);
      await cleanupCompleted(live, prior[0]);
      return true;
    }
  }
  if (await has(RESTORE_WORK)) {
    if (!(await has(MANIFEST))) {
      demand(!prior.length, "恢复工作数据不完整，不能确认已提交结果");
      // No publishable manifest and no restore receipt: staging never changed SQL.
      await removeVerified(RESTORE_WORK);
      return false;
    }
    await assertStagedWork();
    if (remnant && live) {
      // The staged restore commits into `data.sqlite` and proves itself through
      // the control receipt table, so the interrupted first launch is completed
      // to the trusted schema first. That file holds no row by construction
      // (only an empty metadata table or nothing at all); the restore replaces
      // every table afterwards, and the seed record is never written here.
      await ensureDatabaseSchema(live, { forceFull: true });
    }
    await finishSingleRestore();
    return true;
  }
  if (live && prior.length) {
    demand(
      prior.length === 1 && prior[0].result_id === "complete",
      "恢复所需工作数据缺失，请保留备份，不新建空库",
    );
    await cleanupCompleted(live, prior[0]);
    return true;
  }
  return false;
}
