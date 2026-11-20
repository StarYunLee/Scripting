import { ItemoryError } from "../domain/errors";
import {
  APP_METADATA_TABLE,
  METADATA_SCHEMA_SQL,
  ensureMetadataTable,
} from "./metadata-schema";
import {
  ASSET_BLOB_COLUMNS,
  ASSET_BLOB_SCHEMA_SQL,
  ASSET_BLOB_TABLE,
} from "./asset-blob-store";

export const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
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
  asset_blobs: ASSET_BLOB_COLUMNS,
  mutation_receipts: [
    "command_id",
    "kind",
    "payload_hash",
    "result_id",
    "created_at",
  ],
  cas_check: ["ok"],
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL CHECK(mime IN ('image/png')),
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK(byte_size >= 0),
  created_at INTEGER NOT NULL
);
${ASSET_BLOB_SCHEMA_SQL}
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  acquired_on TEXT NOT NULL,
  acquisition_amount_minor INTEGER CHECK(acquisition_amount_minor IS NULL OR acquisition_amount_minor >= 0),
  holding_condition TEXT NOT NULL DEFAULT 'in_use' CHECK(holding_condition IN ('in_use', 'idle', 'damaged')),
  icon_symbol TEXT,
  cover_asset_id TEXT,
  channel TEXT,
  warranty_until TEXT,
  valuation_minor INTEGER CHECK(valuation_minor IS NULL OR valuation_minor >= 0),
  notes TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE TABLE IF NOT EXISTS money_entries (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('expense', 'income')),
  kind TEXT NOT NULL CHECK(kind IN ('accessory', 'maintenance', 'repair', 'upgrade', 'other')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  occurred_on TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS item_exits (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(reason IN ('sold', 'gifted', 'discarded', 'lost')),
  exited_on TEXT NOT NULL,
  recovery_amount_minor INTEGER CHECK(recovery_amount_minor IS NULL OR recovery_amount_minor >= 0),
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mutation_receipts (
  command_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cas_check (ok INTEGER NOT NULL CHECK(ok = 1));
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_entries_item ON money_entries(item_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_assets_relative_path ON assets(relative_path);
CREATE INDEX IF NOT EXISTS idx_receipts_kind_created ON mutation_receipts(kind, created_at, command_id);
CREATE TRIGGER IF NOT EXISTS items_cover_asset_insert_guard
BEFORE INSERT ON items
WHEN NEW.cover_asset_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM assets WHERE id = NEW.cover_asset_id)
BEGIN
  SELECT RAISE(ABORT, 'missing cover asset');
END;
CREATE TRIGGER IF NOT EXISTS items_cover_asset_update_guard
BEFORE UPDATE OF cover_asset_id ON items
WHEN NEW.cover_asset_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM assets WHERE id = NEW.cover_asset_id)
BEGIN
  SELECT RAISE(ABORT, 'missing cover asset');
END;
CREATE TRIGGER IF NOT EXISTS assets_delete_reference_guard
BEFORE DELETE ON assets
WHEN EXISTS (SELECT 1 FROM items WHERE cover_asset_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'cover asset is referenced');
END;
`;

function schemaMismatch(message: string): Error {
  return new ItemoryError("SCHEMA_MISMATCH", `SchemaMismatch：${message}`);
}

async function tableExists(
  db: SQLite.Database,
  name: string,
): Promise<boolean> {
  const rows = await db.fetchAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return rows.length > 0;
}

async function tableColumns(
  db: SQLite.Database,
  name: string,
): Promise<Set<string>> {
  const rows = await db.fetchAll<{ name: string }>(
    `PRAGMA table_info(${name})`,
  );
  return new Set(rows.map((row) => row.name));
}

async function assertColumns(
  db: SQLite.Database,
  table: string,
  required: readonly string[],
): Promise<void> {
  if (!(await tableExists(db, table)))
    throw schemaMismatch(`缺少数据表 ${table}`);
  const columns = await tableColumns(db, table);
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length > 0)
    throw schemaMismatch(`${table} 缺少列 ${missing.join(", ")}`);
}

async function assertForeignKeys(db: SQLite.Database): Promise<void> {
  const enabled = await db.fetchAll<{ foreign_keys: number }>(
    "PRAGMA foreign_keys",
  );
  if (enabled[0]?.foreign_keys !== 1)
    throw schemaMismatch("SQLite 外键约束未启用");

  const expectations: Record<string, readonly string[]> = {
    items: ["categories"],
    item_tags: ["items", "tags"],
    money_entries: ["items"],
    item_exits: ["items"],
  };
  for (const [table, destinations] of Object.entries(expectations)) {
    const rows = await db.fetchAll<{ table: string }>(
      `PRAGMA foreign_key_list(${table})`,
    );
    const actual = new Set(rows.map((row) => row.table));
    const missing = destinations.filter(
      (destination) => !actual.has(destination),
    );
    if (missing.length > 0)
      throw schemaMismatch(`${table} 缺少外键 ${missing.join(", ")}`);
  }
}

async function assertIndexes(db: SQLite.Database): Promise<void> {
  const required = [
    "idx_items_category",
    "idx_items_updated",
    "idx_money_entries_item",
    "idx_assets_relative_path",
    "idx_receipts_kind_created",
  ];
  const rows = await db.fetchAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index'",
  );
  const actual = new Set(rows.map((row) => row.name));
  const missing = required.filter((name) => !actual.has(name));
  if (missing.length > 0)
    throw schemaMismatch(`缺少索引 ${missing.join(", ")}`);
}

async function assertTriggers(db: SQLite.Database): Promise<void> {
  const required = [
    "items_cover_asset_insert_guard",
    "items_cover_asset_update_guard",
    "assets_delete_reference_guard",
  ];
  const rows = await db.fetchAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'trigger'",
  );
  const actual = new Set(rows.map((row) => row.name));
  const missing = required.filter((name) => !actual.has(name));
  if (missing.length > 0)
    throw schemaMismatch(`缺少资源约束 ${missing.join(", ")}`);
}

export const TRUSTED_SCHEMA_SQL = `${SCHEMA_SQL}\n${METADATA_SCHEMA_SQL};`;

/** Bump implicitly: any change to the trusted schema text changes this. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
export const SCHEMA_FINGERPRINT = fingerprint(
  `${TRUSTED_SCHEMA_SQL}\n${JSON.stringify(REQUIRED_COLUMNS)}`,
);

interface SchemaMarker {
  fingerprint: string;
  schemaVersion: number;
}

async function readSchemaMarker(path: string): Promise<SchemaMarker | null> {
  try {
    const parsed = JSON.parse(await FileManager.readAsString(path)) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as SchemaMarker).fingerprint === "string" &&
      Number.isSafeInteger((parsed as SchemaMarker).schemaVersion)
    )
      return parsed as SchemaMarker;
  } catch {
    /* Missing or unreadable marker means a full check. */
  }
  return null;
}

/**
 * Full structural verification runs on new databases, after a restore, when
 * no marker exists, when the schema text changed (fingerprint), or when any
 * DDL touched the file since the last full check (SQLite's schema_version
 * cookie increments on every schema change). The marker is a sidecar file so
 * user data and backups stay untouched; it is written only after every
 * assertion passed. Without markerPath every call is a full check.
 */
export async function ensureDatabaseSchema(
  db: SQLite.Database,
  options: { forceFull?: boolean; markerPath?: string } = {},
): Promise<void> {
  const existing = await db.fetchAll<{ name: string; type: string }>("SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*'");
  const allowed = new Set([...Object.keys(REQUIRED_COLUMNS), "app_metadata"]);
  if (existing.some(row => row.type !== "table" || !allowed.has(row.name))) throw schemaMismatch("含非当前结构的表或视图");
  // Only three shapes may be opened: a brand-new empty file, the two states a
  // first launch can be interrupted in (no object at all, or the metadata table
  // the previous build created as its own step), and the complete trusted set.
  // Anything else is refused instead of being completed by guesswork.
  const blank = existing.length === 0;
  const metadataOnly = !blank && existing.length === 1 && existing[0].name === APP_METADATA_TABLE;
  const complete = existing.length === allowed.size;
  if (!blank && !metadataOnly && !complete) {
    // 旧版数据库没有封面字节表：当前版本不会再回填、也不会按文件副本兜底显示，
    // 因此必须在任何 DDL 之前拒绝打开，而不是补建一张空表让全部封面变成“缺失”。
    if (!existing.some(row => row.name === ASSET_BLOB_TABLE))
      throw schemaMismatch(
        `旧版数据库缺少数据表 ${ASSET_BLOB_TABLE}，请用当前版本的完整备份恢复或通过数据交换重新导入`,
      );
    throw schemaMismatch("数据库结构不完整，未允许自动补齐");
  }
  const { markerPath } = options;
  if (markerPath && !options.forceFull && complete) {
    let fast: { sv: number; fk: number } | null = null;
    let marker: SchemaMarker | null = null;
    try {
      // Fast-path probing never decides failure: any host error here
      // (e.g. pragma table functions unavailable) falls back to the full check.
      [marker, fast] = await Promise.all([
        readSchemaMarker(markerPath),
        Promise.all([
          db.fetchAll<{ schema_version: number }>("PRAGMA schema_version"),
          db.fetchAll<{ foreign_keys: number }>("PRAGMA foreign_keys"),
        ]).then(([sv, fk]) => ({
          sv: Number(sv[0]?.schema_version),
          fk: Number(fk[0]?.foreign_keys),
        })),
      ]);
    } catch (error) {
      console.log(`[Schema] Fast path unavailable, running full check: ${String(error)}`);
      fast = null;
    }
    if (
      fast &&
      fast.fk === 1 &&
      marker?.fingerprint === SCHEMA_FINGERPRINT &&
      marker.schemaVersion === Number(fast.sv)
    )
      return;
  }
  // Validate existing data before any initialization writes; never migrate it.
  // The metadata remnant is validated by `ensureMetadataTable` (a malformed
  // table is refused, never replaced); the idempotent DDL below only adds the
  // tables a first launch had not created yet.
  await ensureMetadataTable(db, blank);
  await db.execute(SCHEMA_SQL);
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    await assertColumns(db, table, columns);
  }
  await assertForeignKeys(db);
  await assertIndexes(db);
  await assertTriggers(db);
  if (!markerPath) return;
  try {
    const rows = await db.fetchAll<{ sv: number }>("PRAGMA schema_version");
    const marker: SchemaMarker = {
      fingerprint: SCHEMA_FINGERPRINT,
      schemaVersion: Number((rows[0] as Record<string, unknown> | undefined)?.schema_version),
    };
    await FileManager.writeAsString(markerPath, JSON.stringify(marker));
  } catch (error) {
    console.log(`[Schema] Marker not written; next launch runs full check: ${String(error)}`);
  }
}

export function appendAssetRegistration(
  sql: string,
  args: SQLite.DatabaseValue[],
  assetId: string | null | undefined,
  now: number,
): { sql: string; args: SQLite.DatabaseValue[] } {
  if (!assetId) return { sql, args };
  return {
    sql: `INSERT OR IGNORE INTO assets(id,relative_path,mime,byte_size,created_at) VALUES(?,?,'image/png',0,?);\n${sql}`,
    args: [assetId, assetId, now, ...args],
  };
}
