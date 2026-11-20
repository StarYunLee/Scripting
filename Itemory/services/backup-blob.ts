/**
 * Blob-aware primitives for the v2 single-file snapshot.
 *
 * The Scripting SQLite bridge exchanges BLOBs as `Data`. Every read here is
 * defensive: a value may arrive as `Data`, a `Uint8Array`/Buffer or a plain
 * `ArrayBuffer`, and anything else is refused instead of guessed. No routine
 * keeps more than one cover in memory.
 */
import {
  ASSET_BLOB_COLUMNS,
  BACKUP_DOCUMENT_COLUMNS,
  BACKUP_DOCUMENT_KEYS,
  BACKUP_DOCUMENT_TABLE,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BLOB_PAGE_SIZE,
  MAX_BLOB_BYTES,
  MAX_BLOB_TOTAL_BYTES,
  MAX_PREFS_BYTES,
  ASSET_BLOBS_DDL,
  ASSET_BLOBS_TABLE,
  BACKUP_DOCUMENT_DDL,
} from "./backup-format";
import { backupIdentifier } from "./backup-read";
import { assertImageDimensions } from "./image-dimensions";

const HEX_SHA256 = /^[a-f0-9]{64}$/;

export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value && typeof value === "object") {
    const candidate = value as {
      toUint8Array?: () => Uint8Array | null;
      bytes?: unknown;
    };
    if (typeof candidate.toUint8Array === "function") {
      const bytes = candidate.toUint8Array();
      if (bytes instanceof Uint8Array) return bytes;
    }
    if (candidate.bytes instanceof Uint8Array) return candidate.bytes;
  }
  throw new Error("备份封面数据无法读取");
}

/** BLOB argument for the SQLite bridge. */
export function blobArgument(bytes: Uint8Array): Data {
  const data = Data.fromUint8Array(bytes);
  if (!data) throw new Error("备份封面数据无法写入");
  return data;
}

export function sha256Hex(bytes: Uint8Array): string {
  const data = Data.fromUint8Array(bytes);
  if (!data) throw new Error("备份封面数据摘要失败");
  return Crypto.sha256(data).toHexString();
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && HEX_SHA256.test(value);
}

/**
 * A snapshot cover must be a decodable PNG header within the size budget. The
 * header check mirrors the live cover reader; decoding the whole image on every
 * row would allocate far more memory than the file itself.
 */
export function assertBlobBytes(bytes: Uint8Array, label: string): void {
  if (!bytes.length) throw new Error(`备份封面数据为空：${label}`);
  if (bytes.length > MAX_BLOB_BYTES) throw new Error(`备份封面数据过大：${label}`);
  assertImageDimensions(bytes);
}

export async function tableExists(
  db: SQLite.Database,
  name: string,
): Promise<boolean> {
  const rows = await db.fetchAll(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [name],
  );
  return rows.length > 0;
}

export interface TableShape {
  name: string;
  type: string;
  primaryKey: number;
  hidden: number;
}

async function tableShape(
  db: SQLite.Database,
  table: string,
): Promise<TableShape[]> {
  const columns = await db.fetchAll<{
    name: string;
    type: string;
    pk: number;
    hidden: number;
  }>(`PRAGMA table_xinfo(${backupIdentifier(table)})`);
  return columns.map((column) => ({
    name: column.name,
    type: String(column.type).toUpperCase(),
    primaryKey: Number(column.pk),
    hidden: Number(column.hidden),
  }));
}

/**
 * The live `asset_blobs` table must have exactly the documented four columns in
 * order, `asset_id` as the only primary-key column and BLOB/INTEGER/TEXT
 * storage classes. Returns false when the table is simply absent (a database
 * that predates v2); a present but different table is fail-closed.
 */
export async function inspectAssetBlobsTable(
  db: SQLite.Database,
): Promise<boolean> {
  if (!(await tableExists(db, ASSET_BLOBS_TABLE))) return false;
  const columns = await tableShape(db, ASSET_BLOBS_TABLE);
  const hidden = columns.some((column) => column.hidden !== 0);
  if (
    hidden ||
    columns.length !== ASSET_BLOB_COLUMNS.length ||
    columns.some((column, index) => column.name !== ASSET_BLOB_COLUMNS[index])
  )
    throw new Error("封面数据表结构不兼容");
  if (
    columns[0].primaryKey !== 1 ||
    columns.some((column, index) => index > 0 && column.primaryKey !== 0) ||
    columns[0].type !== "TEXT" ||
    columns[1].type !== "BLOB" ||
    columns[2].type !== "INTEGER" ||
    columns[3].type !== "TEXT"
  )
    throw new Error("封面数据表结构不兼容");
  return true;
}

/**
 * Idempotent creation of the live blob store. Used by the writer before it
 * reads live blobs and by the v2 restore transaction; the same DDL is exported
 * for the live schema owner.
 */
export async function ensureAssetBlobSchema(db: SQLite.Database): Promise<void> {
  if (await inspectAssetBlobsTable(db)) return;
  await db.execute(ASSET_BLOBS_DDL);
  if (!(await inspectAssetBlobsTable(db)))
    throw new Error("封面数据表创建结果未确认");
}

export interface BackupDocument {
  createdAt: number;
  prefsText: string | null;
}

function prefsProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "设置格式不兼容";
  const prefs = value as Record<string, unknown>;
  if (!["list", "card"].includes(String(prefs.inventoryLayout)))
    return "设置格式不兼容";
  if (
    prefs.hiddenCategoryIds !== undefined &&
    (!Array.isArray(prefs.hiddenCategoryIds) ||
      prefs.hiddenCategoryIds.some((id) => typeof id !== "string"))
  )
    return "设置格式不兼容";
  if (
    prefs.uiTheme !== undefined &&
    !["native", "glass"].includes(String(prefs.uiTheme))
  )
    return "设置格式不兼容";
  return null;
}

/** Validates the embedded settings document exactly once, at snapshot level. */
export function assertPrefsText(text: string): void {
  if (text.length > MAX_PREFS_BYTES) throw new Error("备份设置超过安全限制");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份设置格式不兼容");
  }
  const problem = prefsProblem(parsed);
  if (problem) throw new Error(problem);
}

/**
 * Reads `backup_document` fail-closed: exact key set, one row per key, raw text
 * values, the exact format marker/version and a validated settings document.
 */
export async function readBackupDocument(
  db: SQLite.Database,
): Promise<BackupDocument> {
  if (!(await tableExists(db, BACKUP_DOCUMENT_TABLE)))
    throw new Error("备份缺少格式说明");
  const columns = await tableShape(db, BACKUP_DOCUMENT_TABLE);
  if (
    columns.length !== BACKUP_DOCUMENT_COLUMNS.length ||
    columns.some((column, index) => column.name !== BACKUP_DOCUMENT_COLUMNS[index]) ||
    columns[0].primaryKey !== 1 ||
    columns[1].primaryKey !== 0 ||
    columns[0].type !== "TEXT" ||
    columns[1].type !== "TEXT"
  )
    throw new Error("备份格式说明结构不兼容");
  const rows = await db.fetchAll<{ key: unknown; value: unknown }>(
    `SELECT key,value FROM ${BACKUP_DOCUMENT_TABLE}`,
  );
  const values = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.key !== "string" || typeof row.value !== "string")
      throw new Error("备份格式说明无效");
    if (values.has(row.key)) throw new Error("备份格式说明重复");
    values.set(row.key, row.value);
  }
  for (const key of values.keys())
    if (!(BACKUP_DOCUMENT_KEYS as readonly string[]).includes(key))
      throw new Error("备份格式说明含未知字段");
  for (const key of BACKUP_DOCUMENT_KEYS)
    if (!values.has(key) && key !== "prefs")
      throw new Error("备份格式说明不完整");
  if (values.get("format") !== BACKUP_FORMAT)
    throw new Error("备份文件格式无法识别");
  if (values.get("format_version") !== String(BACKUP_FORMAT_VERSION))
    throw new Error("备份文件格式版本不受支持");
  const createdAtText = values.get("created_at") ?? "";
  if (!/^[1-9][0-9]{11,15}$/.test(createdAtText))
    throw new Error("备份创建时间无效");
  const prefsText = values.get("prefs") ?? null;
  if (prefsText !== null) assertPrefsText(prefsText);
  return { createdAt: Number(createdAtText), prefsText };
}

/** Writes the format marker and the embedded settings document. */
export async function writeBackupDocument(
  db: SQLite.Database,
  document: { createdAt: number; prefsText: string | null },
): Promise<void> {
  if (!Number.isSafeInteger(document.createdAt) || document.createdAt <= 0)
    throw new Error("备份创建时间无效");
  const rows: [string, string][] = [
    ["format", BACKUP_FORMAT],
    ["format_version", String(BACKUP_FORMAT_VERSION)],
    ["created_at", String(document.createdAt)],
  ];
  if (document.prefsText !== null) {
    assertPrefsText(document.prefsText);
    rows.push(["prefs", document.prefsText]);
  }
  await db.execute(BACKUP_DOCUMENT_DDL);
  for (const [key, value] of rows)
    await db.execute(
      `INSERT OR REPLACE INTO ${BACKUP_DOCUMENT_TABLE}(key,value) VALUES(?,?)`,
      [key, value],
    );
}

export interface BlobRow {
  assetId: string;
  bytes: Uint8Array;
  byteSize: number;
  sha256: string;
}

/**
 * Complete, paged walk over `asset_blobs`. Every row is type-checked, bounded,
 * hashed and PNG-checked before it is handed to the caller, so callers never
 * re-implement (or forget) those rules. Returns the verified row count and the
 * verified total size.
 */
export async function scanAssetBlobs(
  db: SQLite.Database,
  onRow: (row: BlobRow, ordinal: number) => void | Promise<void>,
  options: { pageSize?: number; onlyAssetIds?: readonly string[] } = {},
): Promise<{ count: number; totalBytes: number }> {
  const limit =
    Number.isSafeInteger(options.pageSize) && (options.pageSize ?? 0) > 0
      ? Math.min(options.pageSize as number, 64)
      : BLOB_PAGE_SIZE;
  let last: string | null = null;
  let count = 0;
  let totalBytes = 0;
  for (;;) {
    const where: string[] = [];
    const args: SQLite.DatabaseValue[] = [];
    if (last !== null) {
      where.push("asset_id > ?");
      args.push(last);
    }
    const rows = await db.fetchAll<{
      asset_id: unknown;
      png_bytes: unknown;
      byte_size: unknown;
      sha256: unknown;
    }>(
      `SELECT asset_id,png_bytes,byte_size,sha256 FROM ${ASSET_BLOBS_TABLE}` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY asset_id LIMIT ${limit}`,
      args,
    );
    if (rows.length > limit) throw new Error("备份封面读取超出单页上限");
    if (!rows.length) break;
    for (const row of rows) {
      if (typeof row.asset_id !== "string" || !row.asset_id)
        throw new Error("备份封面登记无效");
      if (typeof row.sha256 !== "string" || !isSha256Hex(row.sha256))
        throw new Error("备份封面摘要无效");
      if (!Number.isSafeInteger(row.byte_size) || (row.byte_size as number) < 0)
        throw new Error("备份封面大小无效");
      const bytes = toBytes(row.png_bytes);
      assertBlobBytes(bytes, "封面");
      if (bytes.length !== row.byte_size)
        throw new Error("备份封面大小与内容不一致");
      if (sha256Hex(bytes) !== row.sha256)
        throw new Error("备份封面摘要与内容不一致");
      totalBytes += bytes.length;
      if (totalBytes > MAX_BLOB_TOTAL_BYTES)
        throw new Error("备份封面总量超过安全限制");
      count += 1;
      await onRow(
        {
          assetId: row.asset_id,
          bytes,
          byteSize: bytes.length,
          sha256: row.sha256,
        },
        count,
      );
    }
    last = rows[rows.length - 1].asset_id as string;
  }
  return { count, totalBytes };
}

/** Cheap completeness probe: every asset has a blob and no blob is orphaned. */
export async function blobCompletenessViolation(
  db: SQLite.Database,
  exists: (
    db: SQLite.Database,
    sql: string,
    args?: SQLite.DatabaseValue[],
  ) => Promise<boolean>,
): Promise<string | null> {
  if (
    await exists(
      db,
      `SELECT 1 FROM assets a WHERE NOT EXISTS (SELECT 1 FROM ${ASSET_BLOBS_TABLE} b WHERE b.asset_id=a.id) LIMIT 1`,
    )
  )
    return "备份封面数据不完整";
  if (
    await exists(
      db,
      `SELECT 1 FROM ${ASSET_BLOBS_TABLE} b WHERE NOT EXISTS (SELECT 1 FROM assets a WHERE a.id=b.asset_id) LIMIT 1`,
    )
  )
    return "备份包含未登记的封面数据";
  return null;
}
