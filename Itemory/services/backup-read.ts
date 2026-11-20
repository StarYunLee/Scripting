/**
 * Bounded, complete-scope reads over backup databases.
 *
 * Scripting's SQLite bridge only exposes fetchAll/fetchOne/fetchSet plus the
 * declarative step-array transaction: there is no cursor, no statement
 * iterator and no JavaScript callback inside a transaction. Every scan here
 * therefore reads at most one page of rows per statement and never builds a
 * table-wide JavaScript array.
 *
 * The scan is still *complete*, which matters because a backup is untrusted:
 * - the page cursor is a total order supplied by SQLite itself (rowid, or the
 *   declared identity column of a WITHOUT ROWID table), never OFFSET;
 * - every page is ordered by that cursor and continues strictly after the last
 *   value, so rows cannot be re-read or silently skipped by JavaScript-side
 *   comparisons (TEXT collations stay inside SQLite);
 * - a cursor that fails to advance is a hard error;
 * - after the last page the visited count is compared with count(*), so a
 *   skipped row (duplicate/NULL identity values in a hand-crafted table) is a
 *   rejection instead of an accepted-but-incomplete backup.
 */
export const BOUNDED_PAGE_SIZE = 400;
const MAX_PAGE_SIZE = 512;

export type BackupRow = Record<string, SQLite.DatabaseValue>;

export interface BoundedScan {
  /** Whitelisted table name. */
  table: string;
  /** Whitelisted columns; `*` is never used so a row cannot grow unbounded. */
  columns: readonly string[];
  /** Identity column used when the table has no usable rowid. */
  cursorKey: string;
  /** Extra fixed predicate (placeholders allowed), e.g. `item_id = ?`. */
  filter?: { sql: string; args: SQLite.DatabaseValue[] };
  pageSize?: number;
  /** Diagnostic scope, e.g. `money_entries`. Never contains row values. */
  scope: string;
  onRow: (row: BackupRow, ordinal: number) => void | Promise<void>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Table and column names come from the local whitelist; reject anything else. */
export function backupIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error("备份读取标识无效");
  return name;
}

function boundedLimit(value?: number): number {
  if (value === undefined) return BOUNDED_PAGE_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) return BOUNDED_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

/**
 * rowid is a unique NOT NULL key for ordinary tables, so it is preferred.
 * WITHOUT ROWID tables (no rowid column) require a PRIMARY KEY, which SQLite
 * keeps unique and NOT NULL, so the declared identity column is a safe cursor
 * there as well. A user column literally named rowid/oid/_rowid_ shadows the
 * real rowid, so it is not trusted.
 */
async function resolveCursor(
  db: SQLite.Database,
  table: string,
  cursorKey: string,
): Promise<string> {
  const key = backupIdentifier(cursorKey);
  // Statement-form pragma only: works on every SQLite build, and the table name
  // is already restricted to the local whitelist identifier shape.
  const columns = await db.fetchAll<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  const shadowed = columns.some((column) =>
    ["rowid", "oid", "_rowid_"].includes(String(column.name).toLowerCase()),
  );
  if (!shadowed) {
    try {
      await db.fetchAll(`SELECT rowid FROM ${table} LIMIT 1`);
      return "rowid";
    } catch {
      /* WITHOUT ROWID table: fall through to the declared identity columns. */
    }
  }
  if (!columns.some((column) => column.name === key))
    throw new Error(`备份表 ${table} 缺少可排序键`);
  return key;
}

/**
 * Reads every matching row once, in pages of at most `pageSize` rows.
 * Returns the number of visited rows; throws when the walk was not complete.
 */
export async function scanBounded(
  db: SQLite.Database,
  scan: BoundedScan,
): Promise<number> {
  const table = backupIdentifier(scan.table);
  const columns = scan.columns.map(backupIdentifier).join(",");
  const cursor = await resolveCursor(db, table, scan.cursorKey);
  const limit = boundedLimit(scan.pageSize);
  const filterSql = scan.filter ? `(${scan.filter.sql})` : "";
  let last: SQLite.DatabaseValue = null;
  let visited = 0;
  for (;;) {
    const where: string[] = [];
    const args: SQLite.DatabaseValue[] = [];
    if (scan.filter) {
      where.push(filterSql);
      args.push(...scan.filter.args);
    }
    if (last !== null) {
      where.push(`${cursor} > ?`);
      args.push(last);
    }
    const rows = await db.fetchAll<BackupRow>(
      `SELECT ${cursor} AS __cursor,${columns} FROM ${table}` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY ${cursor} LIMIT ${limit}`,
      args,
    );
    if (rows.length > limit) throw new Error(`${scan.scope} 读取超出单页上限`);
    if (!rows.length) break;
    for (const row of rows) {
      const next = row.__cursor;
      // rowid arrives as a number, identity columns as text.
      if (typeof next !== "number" && typeof next !== "string")
        throw new Error(`${scan.scope} 读取游标无效`);
      visited += 1;
      await scan.onRow(row, visited);
    }
    const next = rows[rows.length - 1].__cursor as SQLite.DatabaseValue;
    if (last !== null && next === last)
      throw new Error(`${scan.scope} 读取游标未推进`);
    last = next;
    if (rows.length < limit) break;
  }
  const totals = await db.fetchAll<{ total: number }>(
    `SELECT count(*) AS total FROM ${table}` +
      (scan.filter ? ` WHERE ${filterSql}` : ""),
    scan.filter ? scan.filter.args : [],
  );
  if (Number(totals[0]?.total) !== visited)
    throw new Error(`${scan.scope} 读取不完整，已拒绝该备份`);
  return visited;
}

/** Single-row existence probe, used for referential checks. */
export async function existsInBackup(
  db: SQLite.Database,
  sql: string,
  args: SQLite.DatabaseValue[] = [],
): Promise<boolean> {
  return (await db.fetchAll(sql, args)).length > 0;
}
