/**
 * The trusted snapshot profile (SQLite v2 `.itemory`).
 *
 * A snapshot is one self-contained SQLite database: the trusted live tables
 * plus `asset_blobs`, whose rows carry the cover PNG bytes themselves, plus
 * `backup_document`, a backup-only table that identifies the format and embeds
 * the settings document. `backup_document` is never copied into live data.
 *
 * There is exactly one generation. Older full-backup shapes (the ZIP payload
 * with `data.sqlite` + `covers/`, and the `records.json` staging protocol with
 * its v1 whitelist) are no longer read or written; a file that does not match
 * this profile is refused instead of being guessed at.
 *
 * The whitelist here is literal on purpose and is never read from an untrusted
 * file. `user_version` must be exactly `SNAPSHOT_VERSION`; a live source only
 * has to stay inside the supported range (it may still predate the marker).
 */
import {
  ASSET_BLOB_COLUMNS as LIVE_ASSET_BLOB_COLUMNS,
  ASSET_BLOB_SCHEMA_SQL,
  ASSET_BLOB_TABLE,
  MAX_COVER_BYTES,
} from "./asset-blob-store";

export const ASSET_BLOBS_TABLE = ASSET_BLOB_TABLE;
export const BACKUP_DOCUMENT_TABLE = "backup_document";
export const BACKUP_RECEIPT_KIND = "backup.restore";

export const BACKUP_FORMAT = "itemory-backup";
export const BACKUP_FORMAT_VERSION = 2;
/** The only snapshot generation. */
export const SNAPSHOT_VERSION = 2;

/**
 * Live schema for the blob store. Column order matches the documented shape
 * `asset_blobs(asset_id TEXT PRIMARY KEY, png_bytes BLOB, byte_size INTEGER,
 * sha256 TEXT)`; NOT NULL and the non-negative size check only tighten the
 * invariants this module already enforces on every row.
 *
 * Exported for the live schema owner: the same DDL must be part of the trusted
 * live schema so `ensureDatabaseSchema` keeps accepting the live database after
 * a restore.
 */
export const ASSET_BLOBS_DDL = ASSET_BLOB_SCHEMA_SQL;

/** Backup-only manifest table; never part of live data. */
export const BACKUP_DOCUMENT_DDL = `CREATE TABLE IF NOT EXISTS backup_document (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

export const ASSET_BLOB_COLUMNS = LIVE_ASSET_BLOB_COLUMNS;
export const BACKUP_DOCUMENT_COLUMNS = ["key", "value"] as const;

/** Snapshot tables (the trusted generation, literal). */
const SNAPSHOT_TABLES: Readonly<Record<string, readonly string[]>> = {
  categories: [
    "id",
    "name",
    "normalized_name",
    "icon",
    "sort_order",
    "is_system",
  ],
  tags: ["id", "name", "normalized_name", "color", "sort_order"],
  items: [
    "id",
    "name",
    "category_id",
    "acquired_on",
    "acquisition_amount_minor",
    "holding_condition",
    "icon_symbol",
    "cover_asset_id",
    "channel",
    "warranty_until",
    "valuation_minor",
    "notes",
    "revision",
    "created_at",
    "updated_at",
  ],
  item_tags: ["item_id", "tag_id"],
  money_entries: [
    "id",
    "item_id",
    "direction",
    "kind",
    "amount_minor",
    "occurred_on",
    "title",
    "note",
    "created_at",
    "updated_at",
  ],
  item_exits: [
    "item_id",
    "reason",
    "exited_on",
    "recovery_amount_minor",
    "note",
    "created_at",
    "updated_at",
  ],
  assets: ["id", "relative_path", "mime", "byte_size", "created_at"],
  [ASSET_BLOBS_TABLE]: ASSET_BLOB_COLUMNS,
  mutation_receipts: [
    "command_id",
    "kind",
    "payload_hash",
    "result_id",
    "created_at",
  ],
  cas_check: ["ok"],
  app_metadata: ["key", "value"],
  [BACKUP_DOCUMENT_TABLE]: BACKUP_DOCUMENT_COLUMNS,
};

/** `asset_blobs` before `items` so the cover reference trigger can resolve. */
const INSERT_ORDER = [
  "categories",
  "tags",
  "assets",
  ASSET_BLOBS_TABLE,
  "items",
  "item_tags",
  "money_entries",
  "item_exits",
  "mutation_receipts",
  "app_metadata",
] as const;

/** Live tables a restore replaces; `backup_document` is intentionally absent. */
const LIVE_ORDER = INSERT_ORDER;

export interface SnapshotKeyGroup {
  columns: readonly string[];
  label: string;
}

const TARGET_KEYS: Readonly<Record<string, readonly SnapshotKeyGroup[]>> = {
  categories: [
    { columns: ["id"], label: "标识" },
    { columns: ["normalized_name"], label: "规范名称" },
  ],
  tags: [
    { columns: ["id"], label: "标识" },
    { columns: ["normalized_name"], label: "规范名称" },
  ],
  assets: [
    { columns: ["id"], label: "标识" },
    { columns: ["relative_path"], label: "相对路径" },
  ],
  items: [{ columns: ["id"], label: "标识" }],
  item_tags: [{ columns: ["item_id", "tag_id"], label: "关联" }],
  money_entries: [{ columns: ["id"], label: "标识" }],
  item_exits: [{ columns: ["item_id"], label: "退出记录" }],
  [ASSET_BLOBS_TABLE]: [{ columns: ["asset_id"], label: "资源标识" }],
  mutation_receipts: [{ columns: ["command_id"], label: "命令标识" }],
  app_metadata: [{ columns: ["key"], label: "键" }],
  [BACKUP_DOCUMENT_TABLE]: [{ columns: ["key"], label: "键" }],
};

const ROW_KEYS: Readonly<Record<string, readonly string[]>> = {
  categories: ["id"],
  tags: ["id"],
  assets: ["id"],
  [ASSET_BLOBS_TABLE]: ["asset_id"],
  items: ["id"],
  item_tags: ["item_id", "tag_id"],
  money_entries: ["id"],
  item_exits: ["item_id"],
  mutation_receipts: ["command_id"],
  app_metadata: ["key"],
  [BACKUP_DOCUMENT_TABLE]: ["key"],
};

export interface SnapshotProfile {
  version: typeof SNAPSHOT_VERSION;
  /** Whitelisted table -> ordered column list. */
  tables: Readonly<Record<string, readonly string[]>>;
  /** Copy order used for restore transactions and clone guards. */
  insertOrder: readonly string[];
  /** Live tables that a restore replaces (never `backup_document`). */
  liveOrder: readonly string[];
  targetKeys: Readonly<Record<string, readonly SnapshotKeyGroup[]>>;
  /** PK/identity columns used for deterministic paging, in row order. */
  rowKeys: Readonly<Record<string, readonly string[]>>;
  /** Rows always carry cover bytes. */
  blobAware: true;
  /** Snapshots always embed the format document. */
  document: true;
}

export const SNAPSHOT: SnapshotProfile = {
  version: SNAPSHOT_VERSION,
  tables: SNAPSHOT_TABLES,
  insertOrder: INSERT_ORDER,
  liveOrder: LIVE_ORDER,
  targetKeys: TARGET_KEYS,
  rowKeys: ROW_KEYS,
  blobAware: true,
  document: true,
};

/** `user_version` values a snapshot must declare. */
export const SNAPSHOT_USER_VERSIONS: readonly number[] = [SNAPSHOT_VERSION];
/** Newest `user_version` a live source may declare (it may predate the marker). */
export const MAX_LIVE_VERSION = SNAPSHOT_VERSION;

/** Accepted logical backup keys inside `backup_document`. */
export const BACKUP_DOCUMENT_KEYS = [
  "format",
  "format_version",
  "created_at",
  "prefs",
] as const;

/** Per-cover PNG budget in a snapshot. */
export const MAX_BLOB_BYTES = MAX_COVER_BYTES;
/** Whole cover library budget in one snapshot. */
export const MAX_BLOB_TOTAL_BYTES = 256 * 1024 * 1024;
/** Embedded settings document budget. */
export const MAX_PREFS_BYTES = 1024 * 1024;
/** Single-file snapshot budget. */
export const SINGLE_FILE_LIMIT = 320 * 1024 * 1024;
/** Rows per blob page: blobs are large, so pages stay tiny. */
export const BLOB_PAGE_SIZE = 8;
/** Rows per digest page for ordinary tables. */
export const DIGEST_PAGE_SIZE = 128;

export interface BackupInspection {
  isValid: boolean;
  itemCount: number;
  moneyEntryCount: number;
  coverCount: number;
  errorMessage?: string;
}
