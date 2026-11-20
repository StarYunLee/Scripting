import {
  assertExchangeTextLimits,
  parseExchange,
  exchangeNameKey,
  type ExchangeData,
  type ExchangeIcon,
} from "./exchange-format";
import { appendReceipt, type MutationContext } from "./mutation";
import {
  appendAssetBlobRegistration,
  type CoverBytes,
} from "./asset-blob-store";

export function exportIcon(value: string | null): ExchangeIcon | null {
  return value
    ? { type: /[^\u0020-\u007e]/.test(value) ? "emoji" : "sfSymbol", value }
    : null;
}
// A single SELECT gives all tables one SQLite read snapshot.
export async function readExchangeSnapshot(
  db: SQLite.Database,
): Promise<ExchangeData> {
  const rows = await db.fetchAll<{ kind: string; value: string }>(`
    SELECT 'item' kind, json_object('id',id,'name',name,'categoryId',category_id,'acquiredOn',acquired_on,'acquisitionAmountMinor',acquisition_amount_minor,'holdingCondition',holding_condition,'iconSymbol',icon_symbol,'coverAssetId',cover_asset_id,'channel',channel,'warrantyUntil',warranty_until,'valuationMinor',valuation_minor,'notes',notes) value FROM items
    UNION ALL SELECT 'money', json_object('id',id,'itemId',item_id,'direction',direction,'kind',kind,'amountMinor',amount_minor,'occurredOn',occurred_on,'title',title,'note',note) FROM money_entries
    UNION ALL SELECT 'exit', json_object('itemId',item_id,'reason',reason,'exitedOn',exited_on,'recoveryAmountMinor',recovery_amount_minor,'note',note) FROM item_exits
    UNION ALL SELECT 'category', json_object('id',id,'name',name,'iconSymbol',icon,'sortOrder',sort_order) FROM categories
    UNION ALL SELECT 'tag', json_object('id',id,'name',name,'color',color,'sortOrder',sort_order) FROM tags
    UNION ALL SELECT 'link', json_object('itemId',item_id,'tagId',tag_id) FROM item_tags
  `);
  const byKind = (kind: string): any[] =>
    rows.filter((r) => r.kind === kind).map((r) => JSON.parse(r.value));
  const categories = byKind("category"),
    tags = byKind("tag"),
    links = byKind("link"),
    money = byKind("money"),
    exits = byKind("exit");
  const snapshot = {
    format: "itemory-data",
    version: 1,
    currency: "CNY",
    catalogs: {
      categories: categories.map(({ name, iconSymbol, sortOrder }) => ({
        name,
        icon: exportIcon(iconSymbol),
        sortOrder,
      })),
      tags: tags.map(({ name, color, sortOrder }) => ({
        name,
        color,
        sortOrder,
      })),
    },
    items: byKind("item").map(
      ({ categoryId, iconSymbol, coverAssetId, ...i }) => ({
        ...i,
        category: categories.find((c) => c.id === categoryId)?.name ?? null,
        tags: links
          .filter((l) => l.itemId === i.id)
          .map((l) => tags.find((t) => t.id === l.tagId)?.name)
          .filter((name): name is string => Boolean(name)),
        icon: exportIcon(iconSymbol),
        cover: coverAssetId ? `images/${coverAssetId}` : null,
        moneyEntries: money
          .filter((m) => m.itemId === i.id)
          .map(({ itemId: _id, ...m }) => m),
        exit:
          exits
            .filter((x) => x.itemId === i.id)
            .map(({ itemId: _id, ...x }) => x)[0] ?? null,
      }),
    ),
  } as ExchangeData;
  // 文本预检在 parseExchange 之前给出条目序号/短名/字段/上限；历史超长
  // 记录只报错、不截断，读取范围与单快照语义保持不变。
  assertExchangeTextLimits(snapshot);
  return parseExchange(snapshot);
}
export interface ExchangeAsset {
  filename: string;
  size: number;
  /**
   * 主库权威字节，必须与安装到 covers 的文件逐字节相同。导入提交时它和物品行
   * 在同一条 `db.execute` 里写入 `asset_blobs`；字节缺失或长度不符时
   * `buildExchangePlan` 在任何写入之前抛错，导入整体取消（fail-closed），
   * 绝不产生“物品引用了没有字节的封面”的静默引用。
   */
  blob: CoverBytes;
}
export interface ExchangePlan {
  sql: string;
  args: SQLite.DatabaseValue[];
  itemCount: number;
}
// The SQL uses only bound values. Catalog resolution is inside the same atomic batch,
// so concurrently inserted same-name catalogs cannot break associations.
export function buildExchangePlan(
  data: ExchangeData,
  assets: Map<string, ExchangeAsset>,
  command: MutationContext,
  now: number,
  newId: () => string,
): ExchangePlan {
  let sql = "";
  const args: SQLite.DatabaseValue[] = [];
  const add = (s: string, ...a: SQLite.DatabaseValue[]) => {
    sql += s + ";\n";
    args.push(...a);
  };
  const categories = new Map(
    data.catalogs.categories.map((c) => [exchangeNameKey(c.name), c]),
  );
  const tags = new Map(
    data.catalogs.tags.map((t) => [exchangeNameKey(t.name), t]),
  );
  for (const i of data.items) {
    if (i.category && !categories.has(exchangeNameKey(i.category)))
      categories.set(exchangeNameKey(i.category), {
        name: i.category,
        icon: null,
        sortOrder: categories.size,
      });
    for (const name of i.tags)
      if (!tags.has(exchangeNameKey(name)))
        tags.set(exchangeNameKey(name), {
          name,
          color: "#007AFF",
          sortOrder: tags.size,
        });
  }
  for (const [key, c] of categories)
    add(
      "INSERT OR IGNORE INTO categories(id,name,normalized_name,icon,sort_order,is_system) VALUES(?,?,?,?,?,0)",
      newId(),
      c.name,
      key,
      c.icon?.value ?? "shippingbox.fill",
      c.sortOrder,
    );
  for (const [key, t] of tags)
    add(
      "INSERT OR IGNORE INTO tags(id,name,normalized_name,color,sort_order) VALUES(?,?,?,?,?)",
      newId(),
      t.name,
      key,
      t.color,
      t.sortOrder,
    );
  for (const a of assets.values()) {
    // 写入前的最后一道闸：字节必须在、长度必须与文件一致。抛错发生在
    // saveJournal / 安装封面 / 执行 SQL 之前，因此不会有任何写入。
    if (!a.blob || a.blob.byteSize !== a.size)
      throw new Error(
        `封面 ${a.filename} 字节缺失或与文件长度不一致，导入已取消（未写入任何数据）`,
      );
    add(
      "INSERT INTO assets(id,relative_path,mime,byte_size,created_at) VALUES(?,?,'image/png',?,?)",
      a.filename,
      a.filename,
      a.blob.byteSize,
      now,
    );
  }
  for (const i of data.items) {
    const localId = newId(),
      asset = i.cover ? assets.get(i.cover) : null;
    if (i.cover && !asset) throw new Error(`封面未准备：${i.cover}`);
    add(
      `INSERT INTO items(id,name,category_id,acquired_on,acquisition_amount_minor,holding_condition,icon_symbol,cover_asset_id,channel,warranty_until,valuation_minor,notes,revision,created_at,updated_at)
      VALUES(?,?,(SELECT id FROM categories WHERE normalized_name=?),?,?,?,?,?,?,?,?,?,1,?,?)`,
      localId,
      i.name,
      i.category ? exchangeNameKey(i.category) : null,
      i.acquiredOn,
      i.acquisitionAmountMinor,
      i.holdingCondition,
      i.icon?.value ?? null,
      asset?.filename ?? null,
      i.channel,
      i.warrantyUntil,
      i.valuationMinor,
      i.notes,
      now,
      now,
    );
    for (const tag of i.tags)
      add(
        "INSERT INTO item_tags(item_id,tag_id) VALUES(?,(SELECT id FROM tags WHERE normalized_name=?))",
        localId,
        exchangeNameKey(tag),
      );
    for (const m of i.moneyEntries)
      add(
        "INSERT INTO money_entries(id,item_id,direction,kind,amount_minor,occurred_on,title,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        newId(),
        localId,
        m.direction,
        m.kind,
        m.amountMinor,
        m.occurredOn,
        m.title,
        m.note,
        now,
        now,
      );
    if (i.exit) {
      const x = i.exit;
      add(
        "INSERT INTO item_exits(item_id,reason,exited_on,recovery_amount_minor,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        localId,
        x.reason,
        x.exitedOn,
        x.recoveryAmountMinor,
        x.note,
        now,
        now,
      );
    }
  }
  let batch = appendReceipt(
    sql,
    args,
    command,
    String(data.items.length),
    now,
  );
  // 封面字节与物品行在同一条原子语句里提交：字节行被前置到整批语句之前，
  // 而 items 的封面引用触发器只要求同一批里 assets 行先出现（顺序保持不变）；
  // asset_blobs 不参与 items/assets 的引用约束，因此前后位置不影响语义。
  // appendAssetBlobRegistration 自带断言：字节行没有真正落库时 cas_check 触发
  // CHECK 失败，整条 execute 回滚，物品行也不会存在（fail-closed）。
  for (const a of assets.values())
    batch = appendAssetBlobRegistration(batch.sql, batch.args, a.filename, a.blob);
  return { ...batch, itemCount: data.items.length };
}
