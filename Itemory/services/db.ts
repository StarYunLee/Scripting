import { ItemoryError } from "../domain/errors";
import { DEFAULT_CATEGORIES } from "../models/types";
import { ASSET_BLOB_TABLE } from "./asset-blob-store";
import { RESTORE_WORK } from "./backup-work";
import { DB_PATH, ensureDataDirectories } from "./paths";
import { ensureDatabaseSchema } from "./schema";
import { recoverRestoreAtStartup } from "./backup-single";
import { timeStartupStep } from "./startup-timing";

let dbInstance: SQLite.Database | null = null;
let initPromise: Promise<SQLite.Database> | null = null;

/**
 * The one durable record that this database was born here and its default
 * categories were written. It lives in `app_metadata` because a restored
 * snapshot carries metadata with it, so a restore never looks like a first
 * launch again.
 */
const DEFAULTS_SEEDED_KEY = "category_catalog_v2";

function isProRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("scripting pro") ||
    normalized.includes("pro subscription") ||
    normalized.includes("requires pro") ||
    normalized.includes("pro required") ||
    normalized.includes("pro feature") ||
    normalized.includes("upgrade to pro") ||
    normalized.includes("需要 scripting pro") ||
    normalized.includes("需要 pro") ||
    normalized.includes("开通 pro") ||
    normalized.includes("订阅 pro")
  );
}

function normalizeDatabaseError(error: unknown): unknown {
  return isProRequiredError(error)
    ? new ItemoryError("PRO_REQUIRED", "SQLite 需要 Scripting Pro。", error)
    : error;
}

function openDatabase(path: string): SQLite.Database {
  try {
    return SQLite.open(path);
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

export function getDatabase(): Promise<SQLite.Database> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!initPromise) {
    initPromise = (async () => {
      const restored = await timeStartupStep(
        "recoverRestoreAtStartup",
        recoverRestoreAtStartup,
      );
      await timeStartupStep("ensureDataDirectories", ensureDataDirectories);
      const exists = await FileManager.exists(DB_PATH);
      const db = openDatabase(DB_PATH);
      await timeStartupStep("ensureDatabaseSchema", () =>
        ensureDatabaseSchema(db, {
          forceFull: restored || !exists,
          markerPath: `${DB_PATH}.schema-check.json`,
        }),
      );
      // A restore replaces the rows (its snapshot brings its own categories and
      // seed record), so seeding only ever runs for a database born here.
      if (!restored)
        await timeStartupStep("ensureDefaultCategories", () =>
          ensureDefaultCategories(db),
        );
      dbInstance = db;
      return db;
    })().catch((error) => {
      initPromise = null;
      throw normalizeDatabaseError(error);
    });
  }
  return initPromise;
}

async function defaultsSeeded(db: SQLite.Database): Promise<boolean> {
  const rows = await db.fetchAll<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key=?",
    [DEFAULTS_SEEDED_KEY],
  );
  return rows.length === 1 && rows[0].value === "1";
}

/**
 * The rows a finished first launch would never leave empty. Categories count
 * because the seed itself is the last step of a first launch: an interrupted
 * launch can leave them at zero, a launch the user ever used cannot.
 */
async function hasNoStoredFacts(db: SQLite.Database): Promise<boolean> {
  const rows = await db.fetchAll<Record<string, number>>(
    `SELECT (SELECT count(*) FROM categories) categories,
      (SELECT count(*) FROM tags) tags,
      (SELECT count(*) FROM items) items,
      (SELECT count(*) FROM item_tags) item_tags,
      (SELECT count(*) FROM money_entries) money,
      (SELECT count(*) FROM item_exits) exits,
      (SELECT count(*) FROM assets) assets,
      (SELECT count(*) FROM ${ASSET_BLOB_TABLE}) blobs,
      (SELECT count(*) FROM mutation_receipts) receipts`,
  );
  return Object.values(rows[0] ?? {}).every((count) => Number(count) === 0);
}

/**
 * Completes the default categories of a first launch, and only that.
 *
 * The previous build decided "first launch" from whether `data.sqlite` existed
 * before it was opened, so any interruption after the file was created (or
 * after the schema was built, or after a build that created metadata as its own
 * step) permanently skipped seeding: the app opened with zero categories.
 * The decision now comes from the database itself and is safe to repeat:
 *
 * - a recorded seed wins forever: categories the user renamed, deleted or added
 *   afterwards are never rewritten, re-inserted or re-seeded;
 * - any stored fact (a category, tag, item, cover, receipt — i.e. anything the
 *   user or a restore wrote) means this is not a first launch, so nothing is
 *   touched;
 * - a database declaring a snapshot generation was replaced by a restore and is
 *   never seeded;
 * - a staged restore is never bypassed;
 * - the inserts and the seed record commit inside one `execute`, so a crash
 *   leaves either a complete seed or a still-resumable first launch.
 */
async function ensureDefaultCategories(db: SQLite.Database): Promise<void> {
  if (await defaultsSeeded(db)) return;
  if (!(await hasNoStoredFacts(db))) return;
  const versions = await db.fetchAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if (Number(versions[0]?.user_version ?? 0) !== 0) return;
  if (await FileManager.exists(RESTORE_WORK))
    throw new ItemoryError(
      "STORAGE",
      "恢复尚未完成，未写入默认分类；请重新打开 Itemory 继续核对。",
    );

  let sql = "";
  const args: SQLite.DatabaseValue[] = [];
  for (const category of DEFAULT_CATEGORIES) {
    const normalized = category.name.trim().normalize("NFC").toLowerCase();
    sql += `INSERT OR IGNORE INTO categories(id,name,normalized_name,icon,sort_order,is_system)
      VALUES(?,?,?,?,?,1);\n`;
    args.push(
      category.id,
      category.name,
      normalized,
      category.icon,
      category.sortOrder,
    );
  }
  sql += "INSERT OR REPLACE INTO app_metadata(key,value) VALUES(?,'1');";
  args.push(DEFAULTS_SEEDED_KEY);
  // One db.execute call is the Scripting SQLite atomic boundary. Do not issue
  // BEGIN/COMMIT manually: the host already wraps execute and rejects nesting.
  await db.execute(sql, args);

  // Prove the write instead of trusting the host's completion report.
  const ids = DEFAULT_CATEGORIES.map((category) => category.id);
  const rows = await db.fetchAll<{ id: string }>(
    `SELECT id FROM categories WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const present = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !present.has(id));
  if (missing.length)
    throw new ItemoryError(
      "STORAGE",
      `默认分类写入未确认：${missing.join(", ")}`,
    );
  if (!(await defaultsSeeded(db)))
    throw new ItemoryError("STORAGE", "首次初始化状态未确认，请重新打开 Itemory。");
}

export function newId(): string {
  return UUID.string();
}
