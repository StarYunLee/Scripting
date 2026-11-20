import { ItemoryError } from "../domain/errors";

export const APP_METADATA_TABLE = "app_metadata";
export const METADATA_SCHEMA_SQL = "CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)";

function mismatch(message: string): never {
  throw new ItemoryError("SCHEMA_MISMATCH", `SchemaMismatch：元数据表结构不兼容，${message}`);
}

/** Read-only validation of the single current schema. Never migrates or repairs. */
export async function inspectMetadataTable(db: SQLite.Database): Promise<"app_metadata" | null> {
  const objects = await db.fetchAll<{ name: string; type: string }>(
    "SELECT name,type FROM sqlite_master WHERE name='app_metadata'",
  );
  if (!objects.length) return null;
  if (objects.length !== 1 || objects[0].type !== "table") mismatch("名称被非表对象占用");
  const columns = await db.fetchAll<{ name: string; type: string; pk: number; notnull: number; hidden: number }>("PRAGMA table_xinfo(app_metadata)");
  if (columns.length !== 2 || columns[0].name !== "key" || columns[1].name !== "value" || columns.some(column => column.hidden !== 0 || column.type.toUpperCase() !== "TEXT") || columns[0].pk !== 1 || columns[1].pk !== 0 || columns[1].notnull !== 1) mismatch("需要 key/value 两个原始文本字段");
  const invalid = await db.fetchAll(
    "SELECT 1 FROM app_metadata WHERE typeof(key) <> 'text' OR typeof(value) <> 'text' LIMIT 1",
  );
  if (invalid.length) mismatch("键值不是原始文本");
  return APP_METADATA_TABLE;
}

/** Creates metadata only for a new empty database. Existing schemas must match. */
export async function ensureMetadataTable(db: SQLite.Database, allowCreate = true): Promise<void> {
  if (await inspectMetadataTable(db) === APP_METADATA_TABLE) return;
  if (!allowCreate) mismatch("已有数据库缺少当前元数据表");
  const existing = await db.fetchAll("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*'");
  if (existing.length) mismatch("仅允许为空数据库创建当前元数据表");
  await db.execute(METADATA_SCHEMA_SQL);
  if (await inspectMetadataTable(db) !== APP_METADATA_TABLE) mismatch("新表创建结果未确认");
}
