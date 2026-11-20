import { logStartupStep, markStartup, timeStartupStep } from "./startup-timing";
import type {
  CategoryRecord,
  InventoryStatusFilter,
  ItemCardViewData,
  ItemCondition,
  ItemDetailViewData,
  ItemExitRecord,
  ItemRecord,
  MoneyDirection,
  MoneyEntryKind,
  MoneyEntryRecord,
  TagRecord,
} from "../models/types";
import { calculateCostSummary, unavailableCostSummary } from "../domain/cost";
import { buildTimeline } from "../domain/timeline";
import { getDatabase } from "./db";
import { resolveCoverPath } from "./covers";
import {
  mapSnapshotCategory,
  mapSnapshotExit,
  mapSnapshotItem,
  mapSnapshotMoney,
  mapSnapshotTag,
  type SnapshotRow,
} from "./snapshot-rows";

export interface InventoryPageResult {
  cards: ItemCardViewData[];
  categories: CategoryRecord[];
  totalCount: number;
  allItemCount: number;
  hasMore: boolean;
}

export interface InventoryQueryOptions {
  categoryId?: string | "all" | "uncategorized";
  statusFilter?: InventoryStatusFilter;
  keyword?: string;
  sortField?: "created" | "expense" | "days" | "daily";
  sortDirection?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

type ItemRow = {
  id: string;
  name: string;
  category_id: string | null;
  acquired_on: string;
  acquisition_amount_minor: number | null;
  holding_condition: ItemCondition;
  icon_symbol: string | null;
  cover_asset_id: string | null;
  channel: string | null;
  warranty_until: string | null;
  valuation_minor: number | null;
  notes: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
};

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    acquiredOn: row.acquired_on,
    acquisitionAmountMinor: row.acquisition_amount_minor,
    holdingCondition: row.holding_condition,
    iconSymbol: row.icon_symbol,
    coverAssetId: row.cover_asset_id,
    channel: row.channel,
    warrantyUntil: row.warranty_until,
    valuationMinor: row.valuation_minor,
    notes: row.notes,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(row: {
  id: string;
  name: string;
  normalized_name: string;
  icon: string;
  sort_order: number;
  is_system: number;
}): CategoryRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    icon: row.icon,
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
  };
}

function mapTag(row: {
  id: string;
  name: string;
  normalized_name: string;
  color: string;
  sort_order: number;
}): TagRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    color: row.color,
    sortOrder: row.sort_order,
  };
}

async function listCategoriesWithDb(
  db: SQLite.Database,
): Promise<CategoryRecord[]> {
  const rows = await db.fetchAll<{
    id: string;
    name: string;
    normalized_name: string;
    icon: string;
    sort_order: number;
    is_system: number;
  }>("SELECT * FROM categories ORDER BY sort_order ASC, name ASC");
  return rows.map(mapCategory);
}

export async function listCategories(): Promise<CategoryRecord[]> {
  return listCategoriesWithDb(await getDatabase());
}

export async function listTags(): Promise<TagRecord[]> {
  const db = await getDatabase();
  const rows = await db.fetchAll<{
    id: string;
    name: string;
    normalized_name: string;
    color: string;
    sort_order: number;
  }>("SELECT * FROM tags ORDER BY sort_order ASC, name ASC");
  return rows.map(mapTag);
}

function inventoryWhere(options: InventoryQueryOptions): {
  sql: string;
  args: SQLite.DatabaseValue[];
} {
  const clauses: string[] = [];
  const args: SQLite.DatabaseValue[] = [];
  const categoryId = options.categoryId;
  if (categoryId === "uncategorized") clauses.push("i.category_id IS NULL");
  else if (categoryId && categoryId !== "all") {
    clauses.push("i.category_id = ?");
    args.push(categoryId);
  }

  const status = options.statusFilter;
  if (status && status !== "all") {
    if (status === "in_use" || status === "idle" || status === "damaged") {
      clauses.push("x.item_id IS NULL AND i.holding_condition = ?");
      args.push(status);
    } else {
      clauses.push("x.reason = ?");
      args.push(status);
    }
  }

  const keyword = options.keyword?.trim().normalize("NFC").toLowerCase();
  if (keyword) {
    clauses.push(`(LOWER(i.name) LIKE ? ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM categories c WHERE c.id = i.category_id AND LOWER(c.name) LIKE ? ESCAPE '\\'
    ) OR EXISTS (
      SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id AND LOWER(t.name) LIKE ? ESCAPE '\\'
    ))`);
    const escaped = keyword
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const pattern = `%${escaped}%`;
    args.push(pattern, pattern, pattern);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

function inventoryOrderBy(
  sortField: InventoryQueryOptions["sortField"],
  sortDirection: InventoryQueryOptions["sortDirection"],
): string {
  const direction = sortDirection === "asc" ? "ASC" : "DESC";
  const expense = `(COALESCE(i.acquisition_amount_minor, 0) + COALESCE((
    SELECT SUM(m.amount_minor) FROM money_entries m
    WHERE m.item_id = i.id AND m.direction = 'expense'
  ), 0))`;
  const income = `(COALESCE((
    SELECT SUM(m.amount_minor) FROM money_entries m
    WHERE m.item_id = i.id AND m.direction = 'income'
  ), 0) + COALESCE(x.recovery_amount_minor, 0))`;
  const days = `CAST(julianday(COALESCE(x.exited_on, date('now', 'localtime'))) - julianday(i.acquired_on) + 1 AS INTEGER)`;
  if (sortField === "expense")
    return `${expense} ${direction}, i.created_at DESC, i.id ASC`;
  if (sortField === "days")
    return `${days} ${direction}, i.created_at DESC, i.id ASC`;
  if (sortField === "daily") {
    // SQLite ROUND uses ties away from zero, unlike JS Math.round (+infinity).
    // CAST truncation + signed fractional adjustment needs no optional floor()
    // extension and keeps null/unknown amounts and the existing tie-breaks.
    const ratio = `((${expense} - ${income}) * 1.0 / ${days})`;
    const whole = `CAST(${ratio} AS INTEGER)`;
    const fraction = `(${ratio} - ${whole})`;
    return `(${whole} + CASE WHEN ${fraction} >= 0.5 THEN 1 WHEN ${fraction} < -0.5 THEN -1 ELSE 0 END) ${direction}, i.created_at DESC, i.id ASC`;
  }
  return `i.created_at ${direction}, i.id ${direction}`;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  work: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await work(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

async function loadCardsForRows(
  db: SQLite.Database,
  rows: ItemRow[],
  categoryMap: Map<string, CategoryRecord>,
): Promise<ItemCardViewData[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const tagRows = await db.fetchAll<{
    item_id: string;
    id: string;
    name: string;
    normalized_name: string;
    color: string;
    sort_order: number;
  }>(
    `SELECT it.item_id,t.* FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id IN (${placeholders}) ORDER BY t.sort_order,t.name`,
    ids,
  );
  const tagMap = new Map<string, TagRecord[]>();
  for (const row of tagRows) {
    const list = tagMap.get(row.item_id) ?? [];
    list.push(mapTag(row));
    tagMap.set(row.item_id, list);
  }
  const moneyRows = await db.fetchAll<{
    id: string;
    item_id: string;
    direction: MoneyDirection;
    kind: MoneyEntryKind;
    amount_minor: number;
    occurred_on: string;
    title: string;
    note: string | null;
    created_at: number;
    updated_at: number;
  }>(`SELECT * FROM money_entries WHERE item_id IN (${placeholders})`, ids);
  const moneyMap = new Map<string, MoneyEntryRecord[]>();
  for (const row of moneyRows) {
    const list = moneyMap.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      itemId: row.item_id,
      direction: row.direction,
      kind: row.kind,
      amountMinor: row.amount_minor,
      occurredOn: row.occurred_on,
      title: row.title,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    moneyMap.set(row.item_id, list);
  }
  const exitRows = await db.fetchAll<{
    item_id: string;
    reason: ItemExitRecord["reason"];
    exited_on: string;
    recovery_amount_minor: number | null;
    note: string | null;
    created_at: number;
    updated_at: number;
  }>(`SELECT * FROM item_exits WHERE item_id IN (${placeholders})`, ids);
  const exitMap = new Map(
    exitRows.map((row) => [
      row.item_id,
      {
        itemId: row.item_id,
        reason: row.reason,
        exitedOn: row.exited_on,
        recoveryAmountMinor: row.recovery_amount_minor,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } satisfies ItemExitRecord,
    ]),
  );
  return mapConcurrent(rows, 4, async (row) => {
    const item = mapItem(row);
    const exit = exitMap.get(item.id) ?? null;
    // 同一个库句柄：封面字节（asset_blobs）是与上面这些行同一份快照读取的，
    // 不会因为热点列表里每张封面都重新打开数据库而出现连接/时序漂移。
    const cover = await resolveCoverPath(item.coverAssetId, db);
    return {
      item,
      category: item.categoryId
        ? (categoryMap.get(item.categoryId) ?? null)
        : null,
      tags: tagMap.get(item.id) ?? [],
      exit,
      isExited: exit !== null,
      effectiveStatus: exit ? exit.reason : item.holdingCondition,
      summary: (() => {
        try {
          return calculateCostSummary(item, moneyMap.get(item.id) ?? [], exit);
        } catch (error) {
          return unavailableCostSummary(item, exit, error);
        }
      })(),
      coverPath: cover.path,
    };
  });
}

async function loadCardsForSnapshot(
  db: SQLite.Database,
  rows: SnapshotRow[],
  isCurrent: () => boolean,
): Promise<ItemCardViewData[]> {
  const categories = rows
    .filter((row) => row.kind === "category")
    .map(mapSnapshotCategory);
  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );
  const tagMap = new Map<string, TagRecord[]>();
  for (const row of rows.filter((row) => row.kind === "tag")) {
    const itemId = row.item_id!;
    const list = tagMap.get(itemId) ?? [];
    list.push(mapSnapshotTag(row));
    tagMap.set(itemId, list);
  }
  const moneyMap = new Map<string, MoneyEntryRecord[]>();
  for (const row of rows.filter((row) => row.kind === "money")) {
    const entry = mapSnapshotMoney(row);
    const list = moneyMap.get(entry.itemId) ?? [];
    list.push(entry);
    moneyMap.set(entry.itemId, list);
  }
  const exitMap = new Map(
    rows
      .filter((row) => row.kind === "exit")
      .map((row) => {
        const exit = mapSnapshotExit(row);
        return [exit.itemId, exit] as const;
      }),
  );
  return mapConcurrent(
    rows.filter((row) => row.kind === "item").map(mapSnapshotItem),
    4,
    async (item) => {
      if (!isCurrent()) throw new Error("Inventory request superseded");
      const exit = exitMap.get(item.id) ?? null;
      // 与页面行同一次 SQLite 快照的句柄；封面字节缺失时由派生副本重建。
      const cover = await resolveCoverPath(item.coverAssetId, db);
      return {
        item,
        category: item.categoryId
          ? (categoryMap.get(item.categoryId) ?? null)
          : null,
        tags: (tagMap.get(item.id) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
        exit,
        isExited: exit !== null,
        effectiveStatus: exit ? exit.reason : item.holdingCondition,
        summary: (() => {
          try {
            return calculateCostSummary(
              item,
              moneyMap.get(item.id) ?? [],
              exit,
            );
          } catch (error) {
            return unavailableCostSummary(item, exit, error);
          }
        })(),
        coverPath: cover.path,
      };
    },
  );
}

export async function getInventoryPage(
  options: InventoryQueryOptions = {},
  isCurrent: () => boolean = () => true,
): Promise<InventoryPageResult> {
  const db = await getDatabase();
  const where = inventoryWhere(options);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = Math.max(1, Math.trunc(options.limit ?? 50));
  const order = inventoryOrderBy(options.sortField, options.sortDirection);
  const queryStartedAt = Date.now();
  const rows = await db.fetchAll<SnapshotRow>(
    `WITH page AS (
    SELECT i.* FROM items i LEFT JOIN item_exits x ON x.item_id=i.id ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?
  )
  SELECT 'meta' kind,NULL id,NULL item_id,NULL s1,NULL s2,NULL s3,NULL s4,NULL s5,NULL s6,NULL s7,NULL s8,NULL s9,COUNT(*) n1,(SELECT COUNT(*) FROM items) n2,NULL n3,NULL n4,NULL n5,NULL n6 FROM items i LEFT JOIN item_exits x ON x.item_id=i.id ${where.sql}
  UNION ALL SELECT 'category',c.id,NULL,c.name,c.normalized_name,c.icon,NULL,NULL,NULL,NULL,NULL,NULL,c.sort_order,c.is_system,NULL,NULL,NULL,NULL FROM categories c
  UNION ALL SELECT 'item',p.id,NULL,p.name,p.category_id,p.acquired_on,p.holding_condition,p.icon_symbol,p.cover_asset_id,p.channel,p.warranty_until,p.notes,p.acquisition_amount_minor,p.valuation_minor,p.revision,p.created_at,p.updated_at,NULL FROM page p
  UNION ALL SELECT 'tag',t.id,it.item_id,t.name,t.normalized_name,t.color,NULL,NULL,NULL,NULL,NULL,NULL,t.sort_order,NULL,NULL,NULL,NULL,NULL FROM tags t JOIN item_tags it ON it.tag_id=t.id JOIN page p ON p.id=it.item_id
  UNION ALL SELECT 'money',m.id,m.item_id,m.direction,m.kind,m.occurred_on,m.title,m.note,NULL,NULL,NULL,NULL,m.amount_minor,m.created_at,m.updated_at,NULL,NULL,NULL FROM money_entries m JOIN page p ON p.id=m.item_id
  UNION ALL SELECT 'exit',NULL,x.item_id,x.reason,x.exited_on,x.note,NULL,NULL,NULL,NULL,NULL,NULL,x.recovery_amount_minor,x.created_at,x.updated_at,NULL,NULL,NULL FROM item_exits x JOIN page p ON p.id=x.item_id`,
    [...where.args, limit, offset, ...where.args],
  );
  const categories = rows
    .filter((row) => row.kind === "category")
    .map(mapSnapshotCategory)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  logStartupStep("inventory first page query", queryStartedAt);
  if (!isCurrent()) throw new Error("Inventory request superseded");
  const cards = await timeStartupStep("inventory first page covers+cards", () =>
    loadCardsForSnapshot(db, rows, isCurrent),
  );
  markStartup("inventory first data ready");
  // Both counts come from the same snapshot statement, so they cannot drift
  // from the page rows and the page costs one SQLite bridge call.
  const meta = rows.find((row) => row.kind === "meta");
  const totalCount = meta?.n1 ?? 0;
  return {
    cards,
    categories,
    totalCount,
    allItemCount: meta?.n2 ?? 0,
    hasMore: offset + cards.length < totalCount,
  };
}

export async function getInventorySnapshot(
  options: Omit<InventoryQueryOptions, "offset" | "limit"> = {},
): Promise<ItemCardViewData[]> {
  const db = await getDatabase();
  const categories = await listCategoriesWithDb(db);
  const where = inventoryWhere(options);
  const rows = await db.fetchAll<ItemRow>(
    `SELECT i.* FROM items i LEFT JOIN item_exits x ON x.item_id=i.id ${where.sql} ORDER BY i.updated_at DESC`,
    where.args,
  );
  return loadCardsForRows(
    db,
    rows,
    new Map(categories.map((category) => [category.id, category])),
  );
}

export async function getItemDetail(
  itemId: string,
): Promise<ItemDetailViewData | null> {
  const db = await getDatabase();
  const rows = await db.fetchAll<SnapshotRow>(
    `
    SELECT 'item' kind,id,NULL item_id,name s1,category_id s2,acquired_on s3,holding_condition s4,icon_symbol s5,cover_asset_id s6,channel s7,warranty_until s8,notes s9,acquisition_amount_minor n1,valuation_minor n2,revision n3,created_at n4,updated_at n5,NULL n6 FROM items WHERE id=?
    UNION ALL SELECT 'category',c.id,NULL,c.name,c.normalized_name,c.icon,NULL,NULL,NULL,NULL,NULL,NULL,c.sort_order,c.is_system,NULL,NULL,NULL,NULL FROM categories c JOIN items i ON i.category_id=c.id WHERE i.id=?
    UNION ALL SELECT 'tag',t.id,it.item_id,t.name,t.normalized_name,t.color,NULL,NULL,NULL,NULL,NULL,NULL,t.sort_order,NULL,NULL,NULL,NULL,NULL FROM tags t JOIN item_tags it ON it.tag_id=t.id WHERE it.item_id=?
    UNION ALL SELECT 'money',m.id,m.item_id,m.direction,m.kind,m.occurred_on,m.title,m.note,NULL,NULL,NULL,NULL,m.amount_minor,m.created_at,m.updated_at,NULL,NULL,NULL FROM money_entries m WHERE m.item_id=?
    UNION ALL SELECT 'exit',NULL,x.item_id,x.reason,x.exited_on,x.note,NULL,NULL,NULL,NULL,NULL,NULL,x.recovery_amount_minor,x.created_at,x.updated_at,NULL,NULL,NULL FROM item_exits x WHERE x.item_id=?`,
    [itemId, itemId, itemId, itemId, itemId],
  );
  const itemRow = rows.find((row) => row.kind === "item");
  if (!itemRow) return null;
  const item = mapSnapshotItem(itemRow);
  const categoryRow = rows.find((row) => row.kind === "category");
  const category = categoryRow ? mapSnapshotCategory(categoryRow) : null;
  const tags = rows
    .filter((row) => row.kind === "tag")
    .map(mapSnapshotTag)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const moneyEntries = rows
    .filter((row) => row.kind === "money")
    .map(mapSnapshotMoney);
  const exitRow = rows.find((row) => row.kind === "exit");
  const exit = exitRow ? mapSnapshotExit(exitRow) : null;
  let summary;
  try {
    summary = calculateCostSummary(item, moneyEntries, exit);
  } catch (error) {
    summary = unavailableCostSummary(item, exit, error);
  }
  const cover = await resolveCoverPath(item.coverAssetId, db);
  if (cover.status !== "valid" && item.coverAssetId)
    console.log(`[Cover] reference ${cover.status}`);
  return {
    item,
    category,
    tags,
    exit,
    isExited: exit !== null,
    effectiveStatus: exit ? exit.reason : item.holdingCondition,
    timeline: buildTimeline(item, moneyEntries, exit),
    summary,
    coverPath: cover.path,
  };
}
