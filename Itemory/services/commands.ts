import { coordinateMutation } from "./mutation-coordinator";
import type {
  ExitReason,
  ItemCondition,
  MoneyDirection,
  MoneyEntryKind,
} from "../models/types";
import {
  assertBusinessDate,
  assertEntityNameText,
  assertItemTextFields,
  assertMoneyTextFields,
  assertSafeMinor,
  isExitReason,
  isItemCondition,
  isMoneyDirection,
  isMoneyEntryKind,
  normalizeEntityName,
  uniqueSortedIds,
} from "../domain/validation";
import {
  ITEMORY_ICON_VALUE_MAX_LENGTH,
  assertItemoryText,
} from "../domain/text-limits";
import { notifyDataChanged } from "./change-store";
import { getDatabase, newId } from "./db";
import { isValidYmd } from "./format";
import {
  appendReceipt,
  assertMutationContext,
  buildDeleteItemMutationPayload,
  buildExitMutationPayload,
  buildCategoryMutationPayload,
  buildTagMutationPayload,
  buildItemMutationPayload,
  buildMoneyMutationPayload,
  executeMutationBatch,
  findReceipt,
  type MutationContext,
} from "./mutation";
import {
  invalidateCoverValidation,
  removeUnreferencedCoverPhoto,
  type CoverCleanupResult,
} from "./covers";
import { appendAssetRegistration } from "./schema";
import {
  COVER_BLOB_ERROR,
  appendAssetBlobRegistration,
  ensureCoverReplica,
  loadCoverBytesForWrite,
  retireCoverReplicaForAsset,
  verifyStoredAssetBlob,
  type CoverBytes,
} from "./asset-blob-store";
import { listCategories, listTags } from "./queries";
import {
  assertExitFinancialCandidate,
  assertItemFinancialCandidate,
  assertMoneyFinancialCandidate,
  loadFinancialState,
} from "./financial-state";

async function getItemAcquiredOn(
  db: SQLite.Database,
  itemId: string,
): Promise<string> {
  const rows = await db.fetchAll<{ acquired_on: string }>(
    "SELECT acquired_on FROM items WHERE id = ?",
    [itemId],
  );
  const acquiredOn = rows[0]?.acquired_on;
  if (!acquiredOn) throw new Error("物品不存在");
  if (!isValidYmd(acquiredOn)) throw new Error("数据异常：购入日期无效");
  return acquiredOn;
}

async function assertExistingDatesBeforeNewAcquiredOn(
  db: SQLite.Database,
  itemId: string,
  newAcquiredOn: string,
): Promise<void> {
  const rows = await db.fetchAll<{ earliest: string | null }>(
    `SELECT exited_on AS earliest FROM item_exits WHERE item_id = ?`,
    [itemId],
  );
  const earliest = rows[0]?.earliest;
  if (earliest && earliest < newAcquiredOn) {
    throw new Error("购入日期不能晚于结束持有日期");
  }
}

// ==============================
//           命令层 (Commands)
// ==============================

/**
 * Read the cover bytes that belong to the asset id before the command runs.
 * The bytes travel inside the same atomic statement as the item row, and an
 * unavailable cover is a hard failure: an item must never end up referencing a
 * cover that has neither stored bytes nor a replica on disk.
 */
async function loadCoverBytes(
  db: SQLite.Database,
  assetId: string | null | undefined,
): Promise<CoverBytes | null> {
  const blob = await loadCoverBytesForWrite(db, assetId);
  if (assetId && !blob)
    throw new Error(`${COVER_BLOB_ERROR}：封面图片缺失或无法读取，本次保存已取消`);
  return blob;
}

function isCoverBlobFailure(error: unknown): boolean {
  return String(error).includes(COVER_BLOB_ERROR);
}

/**
 * After the business commit, probe the stored row (type/size only, no byte
 * transfer) and prepare the disposable display cache. Both steps are advisory:
 * the item commit is already the truth and is never rolled back here.
 */
async function settleCoverStorage(
  db: SQLite.Database,
  assetId: string | null | undefined,
  blob: CoverBytes | null,
): Promise<void> {
  if (!assetId || !blob) return;
  try {
    const status = await verifyStoredAssetBlob(db, assetId, blob);
    if (status !== "ok") {
      // 字节没通过复核：保留提升后的文件（绝不删除未被证明的数据），
      // 显示按 fail-closed 留空，等待用户重新选择封面。
      console.log(`[Cover] ${assetId} 封面字节未通过落库复核（${status}），显示按缺失处理`);
      await ensureCoverReplica(db, assetId);
      return;
    }
    // 字节已在库里复核通过：`covers/<id>.png` 的副本不再保留（内容必须逐字节一致
    // 才会删），UI 改从可丢弃的显示缓存取图；重建失败只影响显示，不影响提交。
    if (await retireCoverReplicaForAsset(db, assetId)) invalidateCoverValidation(assetId);
    await ensureCoverReplica(db, assetId);
  } catch (error) {
    console.log(`[Cover] ${assetId} 落库自检失败：${String(error)}`);
  }
}

async function createItemImpl(payload: {
  name: string;
  categoryId: string | null;
  acquiredOn: string;
  acquisitionAmountMinor: number | null;
  holdingCondition?: ItemCondition;
  iconSymbol?: string | null;
  coverAssetId?: string | null;
  channel?: string | null;
  warrantyUntil?: string | null;
  valuationMinor?: number | null;
  notes?: string | null;
  tagIds?: string[];
  command: MutationContext;
}): Promise<string> {
  const name = payload.name.trim();
  const tagIds = uniqueSortedIds(payload.tagIds ?? []);
  if (!name) throw new Error("物品名称不能为空");
  assertItemTextFields({
    name,
    channel: payload.channel?.trim() || null,
    notes: payload.notes?.trim() || null,
    iconSymbol: payload.iconSymbol || null,
  });
  const holdingCondition = payload.holdingCondition ?? "in_use";
  if (!isItemCondition(holdingCondition)) throw new Error("持有状态无效");
  assertBusinessDate(payload.acquiredOn, "购入日期");
  if (payload.warrantyUntil)
    assertBusinessDate(payload.warrantyUntil, "保修日期", {
      allowFuture: true,
    });
  assertSafeMinor(payload.acquisitionAmountMinor, "购入金额");
  assertSafeMinor(payload.valuationMinor, "估值");
  assertMutationContext(
    payload.command,
    "item.create",
    buildItemMutationPayload({
      id: null,
      name,
      categoryId: payload.categoryId,
      acquiredOn: payload.acquiredOn,
      acquisitionAmountMinor: payload.acquisitionAmountMinor,
      holdingCondition,
      iconSymbol: payload.iconSymbol ?? null,
      coverAssetId: payload.coverAssetId ?? null,
      channel: payload.channel ?? null,
      warrantyUntil: payload.warrantyUntil ?? null,
      valuationMinor: payload.valuationMinor ?? null,
      notes: payload.notes ?? null,
      tagIds,
      expectedRevision: null,
    }),
  );

  const db = await getDatabase();
  const replay = await findReceipt(db, payload.command);
  if (replay) return replay;

  const id = newId();
  const now = Date.now();
  const coverBlob = await loadCoverBytes(db, payload.coverAssetId);
  let sql = `
    INSERT INTO items (
      id, name, category_id, acquired_on, acquisition_amount_minor,
      holding_condition, icon_symbol, cover_asset_id, channel,
      warranty_until, valuation_minor, notes, revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);
  `;
  let args: SQLite.DatabaseValue[] = [
    id,
    name,
    payload.categoryId || null,
    payload.acquiredOn,
    payload.acquisitionAmountMinor,
    holdingCondition,
    payload.iconSymbol || null,
    payload.coverAssetId || null,
    payload.channel?.trim() || null,
    payload.warrantyUntil || null,
    payload.valuationMinor ?? null,
    payload.notes?.trim() || null,
    now,
    now,
  ];
  for (const tagId of tagIds) {
    sql += "INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?);\n";
    args.push(id, tagId);
  }
  ({ sql, args } = appendAssetRegistration(
    sql,
    args,
    payload.coverAssetId,
    now,
  ));
  ({ sql, args } = appendAssetBlobRegistration(
    sql,
    args,
    payload.coverAssetId,
    coverBlob,
  ));
  ({ sql, args } = appendReceipt(sql, args, payload.command, id, now));
  try {
    await executeMutationBatch(db, payload.command, id, sql, args);
  } catch (error) {
    if (isCoverBlobFailure(error)) throw error;
    const message = String(error);
    // A missing/ignored BLOB insert aborts through the cas_check channel.
    if (coverBlob && (message.includes("cas_check") || message.includes("ok = 1")))
      throw new Error(
        `${COVER_BLOB_ERROR}：封面图片未能写入数据库，本次保存已回滚`,
      );
    throw error;
  }
  await settleCoverStorage(db, payload.coverAssetId, coverBlob);
  notifyDataChanged();
  return id;
}

async function updateItemImpl(payload: {
  id: string;
  name: string;
  categoryId: string | null;
  acquiredOn: string;
  acquisitionAmountMinor: number | null;
  holdingCondition: ItemCondition;
  iconSymbol?: string | null;
  coverAssetId?: string | null;
  channel?: string | null;
  warrantyUntil?: string | null;
  valuationMinor?: number | null;
  notes?: string | null;
  tagIds?: string[];
  expectedRevision: number;
  command: MutationContext;
}): Promise<void> {
  const name = payload.name.trim();
  const tagIds = uniqueSortedIds(payload.tagIds ?? []);
  if (!name) throw new Error("物品名称不能为空");
  assertItemTextFields({
    name,
    channel: payload.channel?.trim() || null,
    notes: payload.notes?.trim() || null,
    iconSymbol: payload.iconSymbol || null,
  });
  if (!isItemCondition(payload.holdingCondition))
    throw new Error("持有状态无效");
  assertBusinessDate(payload.acquiredOn, "购入日期");
  if (payload.warrantyUntil)
    assertBusinessDate(payload.warrantyUntil, "保修日期", {
      allowFuture: true,
    });
  assertSafeMinor(payload.acquisitionAmountMinor, "购入金额");
  assertSafeMinor(payload.valuationMinor, "估值");
  assertMutationContext(
    payload.command,
    "item.update",
    buildItemMutationPayload({
      id: payload.id,
      name,
      categoryId: payload.categoryId,
      acquiredOn: payload.acquiredOn,
      acquisitionAmountMinor: payload.acquisitionAmountMinor,
      holdingCondition: payload.holdingCondition,
      iconSymbol: payload.iconSymbol ?? null,
      coverAssetId: payload.coverAssetId ?? null,
      channel: payload.channel ?? null,
      warrantyUntil: payload.warrantyUntil ?? null,
      valuationMinor: payload.valuationMinor ?? null,
      notes: payload.notes ?? null,
      tagIds,
      expectedRevision: payload.expectedRevision,
    }),
  );

  const db = await getDatabase();
  if (await findReceipt(db, payload.command)) return;
  await assertExistingDatesBeforeNewAcquiredOn(
    db,
    payload.id,
    payload.acquiredOn,
  );
  const financial = await loadFinancialState(db, payload.id);
  assertItemFinancialCandidate(financial, {
    ...financial.item,
    name,
    categoryId: payload.categoryId || null,
    acquiredOn: payload.acquiredOn,
    acquisitionAmountMinor: payload.acquisitionAmountMinor,
    holdingCondition: payload.holdingCondition,
    iconSymbol: payload.iconSymbol || null,
    coverAssetId: payload.coverAssetId || null,
    channel: payload.channel?.trim() || null,
    warrantyUntil: payload.warrantyUntil || null,
    valuationMinor: payload.valuationMinor ?? null,
    notes: payload.notes?.trim() || null,
  });
  const now = Date.now();
  const coverBlob = await loadCoverBytes(db, payload.coverAssetId);
  let sql = `
    UPDATE items SET name=?, category_id=?, acquired_on=?, acquisition_amount_minor=?,
      holding_condition=?, icon_symbol=?, cover_asset_id=?, channel=?, warranty_until=?,
      valuation_minor=?, notes=?, revision=revision+1, updated_at=?
    WHERE id=? AND revision=?;
    INSERT INTO cas_check SELECT changes();
    DELETE FROM cas_check;
    DELETE FROM item_tags WHERE item_id=?;
  `;
  let args: SQLite.DatabaseValue[] = [
    name,
    payload.categoryId || null,
    payload.acquiredOn,
    payload.acquisitionAmountMinor,
    payload.holdingCondition,
    payload.iconSymbol || null,
    payload.coverAssetId || null,
    payload.channel?.trim() || null,
    payload.warrantyUntil || null,
    payload.valuationMinor ?? null,
    payload.notes?.trim() || null,
    now,
    payload.id,
    payload.expectedRevision,
    payload.id,
  ];
  for (const tagId of tagIds) {
    sql += "INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?);\n";
    args.push(payload.id, tagId);
  }
  ({ sql, args } = appendAssetRegistration(
    sql,
    args,
    payload.coverAssetId,
    now,
  ));
  ({ sql, args } = appendAssetBlobRegistration(
    sql,
    args,
    payload.coverAssetId,
    coverBlob,
  ));
  ({ sql, args } = appendReceipt(sql, args, payload.command, payload.id, now));
  try {
    await executeMutationBatch(db, payload.command, payload.id, sql, args);
  } catch (error) {
    const message = String(error);
    if (message.includes("cas_check") || message.includes("ok = 1")) {
      // The cover assertion aborts through the same cas_check channel; a row
      // that still carries the expected revision proves the CAS itself passed,
      // so the failure belongs to the cover bytes.
      const rows = await db.fetchAll<{ revision: number }>(
        "SELECT revision FROM items WHERE id = ?",
        [payload.id],
      );
      if (rows[0]?.revision === payload.expectedRevision && coverBlob)
        throw new Error(
          `${COVER_BLOB_ERROR}：封面图片未能写入数据库，本次保存已回滚`,
        );
      throw new Error("Conflict：档案已被其他操作修改，请重新加载后再试。");
    }
    throw error;
  }
  await settleCoverStorage(db, payload.coverAssetId, coverBlob);
  notifyDataChanged();
}

export interface DeleteItemResult {
  coverCleanup: CoverCleanupResult | null;
}

async function deleteItemImpl(payload: {
  itemId: string;
  expectedRevision: number;
  command: MutationContext;
}): Promise<DeleteItemResult> {
  const db = await getDatabase();
  const normalized = buildDeleteItemMutationPayload(
    payload.itemId,
    payload.expectedRevision,
  );
  assertMutationContext(payload.command, "item.delete", normalized);
  if (await findReceipt(db, payload.command)) return { coverCleanup: null };
  const oldRows = await db.fetchAll<{ cover_asset_id: string | null }>(
    "SELECT cover_asset_id FROM items WHERE id = ? AND revision = ?",
    [payload.itemId, payload.expectedRevision],
  );
  const oldCover = oldRows[0]?.cover_asset_id ?? null;
  const now = Date.now();
  let sql = `
    DELETE FROM items WHERE id = ? AND revision = ?;
    INSERT INTO cas_check SELECT changes();
    DELETE FROM cas_check;
  `;
  let args: SQLite.DatabaseValue[] = [payload.itemId, payload.expectedRevision];
  ({ sql, args } = appendReceipt(
    sql,
    args,
    payload.command,
    payload.itemId,
    now,
  ));
  try {
    await executeMutationBatch(db, payload.command, payload.itemId, sql, args);
  } catch (error) {
    if (
      String(error).includes("cas_check") ||
      String(error).includes("ok = 1")
    ) {
      throw new Error("Conflict：物品不存在或已被其他操作修改，请重新加载。");
    }
    throw error;
  }
  const coverCleanup = oldCover
    ? await removeUnreferencedCoverPhoto(db, oldCover)
    : null;
  notifyDataChanged();
  return { coverCleanup };
}

async function addMoneyEntryImpl(payload: {
  itemId: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountMinor: number;
  occurredOn: string;
  title: string;
  note?: string | null;
  expectedRevision: number;
  command: MutationContext;
}): Promise<string> {
  const title = payload.title.trim();
  if (!title) throw new Error("事项标题不能为空");
  assertMoneyTextFields({ title, note: payload.note?.trim() || null });
  if (!isMoneyDirection(payload.direction)) throw new Error("资金方向无效");
  if (!isMoneyEntryKind(payload.kind)) throw new Error("资金类型无效");
  if (!Number.isSafeInteger(payload.amountMinor) || payload.amountMinor <= 0)
    throw new Error("金额必须为大于 0 的安全整数分");
  const normalized = buildMoneyMutationPayload({ ...payload, id: null, title });
  assertMutationContext(payload.command, "money.add", normalized);
  const db = await getDatabase();
  const replay = await findReceipt(db, payload.command);
  if (replay) return replay;
  assertBusinessDate(payload.occurredOn, "资金日期");
  const id = newId(),
    now = Date.now();
  const financial = await loadFinancialState(db, payload.itemId);
  assertMoneyFinancialCandidate(financial, {
    id,
    itemId: payload.itemId,
    direction: payload.direction,
    kind: payload.kind,
    amountMinor: payload.amountMinor,
    occurredOn: payload.occurredOn,
    title,
    note: payload.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });
  let sql = `INSERT INTO money_entries(id,item_id,direction,kind,amount_minor,occurred_on,title,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?);
    UPDATE items SET revision=revision+1,updated_at=? WHERE id=? AND revision=?;
    INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [
    id,
    payload.itemId,
    payload.direction,
    payload.kind,
    payload.amountMinor,
    payload.occurredOn,
    title,
    payload.note?.trim() || null,
    now,
    now,
    now,
    payload.itemId,
    payload.expectedRevision,
  ];
  ({ sql, args } = appendReceipt(sql, args, payload.command, id, now));
  try {
    await executeMutationBatch(db, payload.command, id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("Conflict：物品已变化，请重新加载。");
    throw error;
  }
  notifyDataChanged();
  return id;
}

async function updateMoneyEntryImpl(payload: {
  id: string;
  itemId: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountMinor: number;
  occurredOn: string;
  title: string;
  note?: string | null;
  expectedRevision: number;
  command: MutationContext;
}): Promise<void> {
  const title = payload.title.trim();
  if (!title) throw new Error("事项标题不能为空");
  assertMoneyTextFields({ title, note: payload.note?.trim() || null });
  if (!isMoneyDirection(payload.direction)) throw new Error("资金方向无效");
  if (!isMoneyEntryKind(payload.kind)) throw new Error("资金类型无效");
  if (!Number.isSafeInteger(payload.amountMinor) || payload.amountMinor <= 0)
    throw new Error("金额必须为大于 0 的安全整数分");
  assertMutationContext(
    payload.command,
    "money.update",
    buildMoneyMutationPayload({ ...payload, title }),
  );
  const db = await getDatabase();
  if (await findReceipt(db, payload.command)) return;
  assertBusinessDate(payload.occurredOn, "资金日期");
  const now = Date.now();
  const financial = await loadFinancialState(db, payload.itemId);
  const previous = financial.money.find((entry) => entry.id === payload.id);
  if (!previous) throw new Error("记录不存在");
  assertMoneyFinancialCandidate(financial, {
    ...previous,
    direction: payload.direction,
    kind: payload.kind,
    amountMinor: payload.amountMinor,
    occurredOn: payload.occurredOn,
    title,
    note: payload.note?.trim() || null,
    updatedAt: now,
  });
  let sql = `UPDATE money_entries SET direction=?,kind=?,amount_minor=?,occurred_on=?,title=?,note=?,updated_at=? WHERE id=? AND item_id=?;
    INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;
    UPDATE items SET revision=revision+1,updated_at=? WHERE id=? AND revision=?;
    INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [
    payload.direction,
    payload.kind,
    payload.amountMinor,
    payload.occurredOn,
    title,
    payload.note?.trim() || null,
    now,
    payload.id,
    payload.itemId,
    now,
    payload.itemId,
    payload.expectedRevision,
  ];
  ({ sql, args } = appendReceipt(sql, args, payload.command, payload.id, now));
  try {
    await executeMutationBatch(db, payload.command, payload.id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("Conflict：记录或物品已变化，请重新加载。");
    throw error;
  }
  notifyDataChanged();
}

async function deleteMoneyEntryImpl(payload: {
  id: string;
  itemId: string;
  expectedRevision: number;
  command: MutationContext;
}): Promise<void> {
  const normalized = buildMoneyMutationPayload({
    id: payload.id,
    itemId: payload.itemId,
    expectedRevision: payload.expectedRevision,
  });
  assertMutationContext(payload.command, "money.delete", normalized);
  const db = await getDatabase();
  if (await findReceipt(db, payload.command)) return;
  const now = Date.now();
  assertMoneyFinancialCandidate(
    await loadFinancialState(db, payload.itemId),
    null,
    payload.id,
  );
  let sql = `DELETE FROM money_entries WHERE id=? AND item_id=?;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;
    UPDATE items SET revision=revision+1,updated_at=? WHERE id=? AND revision=?;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [
    payload.id,
    payload.itemId,
    now,
    payload.itemId,
    payload.expectedRevision,
  ];
  ({ sql, args } = appendReceipt(sql, args, payload.command, payload.id, now));
  try {
    await executeMutationBatch(db, payload.command, payload.id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("Conflict：记录或物品已变化，请重新加载。");
    throw error;
  }
  notifyDataChanged();
}

async function exitItemImpl(payload: {
  itemId: string;
  reason: ExitReason;
  exitedOn: string;
  recoveryAmountMinor?: number | null;
  note?: string | null;
  expectedRevision: number;
  command: MutationContext;
}): Promise<void> {
  if (!isExitReason(payload.reason)) throw new Error("退出原因无效");
  const recovery =
    payload.reason === "sold" ? (payload.recoveryAmountMinor ?? null) : null;
  assertSafeMinor(recovery, "回收金额");
  assertItemoryText(payload.note?.trim() || null, "退出说明");
  const normalized = buildExitMutationPayload({
    ...payload,
    recoveryAmountMinor: recovery,
  });
  assertMutationContext(payload.command, "item.exit", normalized);
  const db = await getDatabase();
  if (await findReceipt(db, payload.command)) return;
  const acquiredOn = await getItemAcquiredOn(db, payload.itemId);
  assertBusinessDate(payload.exitedOn, "结束日期", { min: acquiredOn });
  const now = Date.now();
  const financial = await loadFinancialState(db, payload.itemId);
  const createdAt = financial.exit?.createdAt ?? now;
  assertExitFinancialCandidate(financial, {
    itemId: payload.itemId,
    reason: payload.reason,
    exitedOn: payload.exitedOn,
    recoveryAmountMinor: recovery,
    note: payload.note?.trim() || null,
    createdAt,
    updatedAt: now,
  });
  let sql = `INSERT OR REPLACE INTO item_exits(item_id,reason,exited_on,recovery_amount_minor,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?);
    UPDATE items SET revision=revision+1,updated_at=? WHERE id=? AND revision=?;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [
    payload.itemId,
    payload.reason,
    payload.exitedOn,
    recovery,
    payload.note?.trim() || null,
    createdAt,
    now,
    now,
    payload.itemId,
    payload.expectedRevision,
  ];
  ({ sql, args } = appendReceipt(
    sql,
    args,
    payload.command,
    payload.itemId,
    now,
  ));
  try {
    await executeMutationBatch(db, payload.command, payload.itemId, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("Conflict：物品已变化，请重新加载。");
    throw error;
  }
  notifyDataChanged();
}

async function undoExitImpl(payload: {
  itemId: string;
  expectedRevision: number;
  command: MutationContext;
}): Promise<void> {
  const normalized = buildExitMutationPayload({
    itemId: payload.itemId,
    expectedRevision: payload.expectedRevision,
  });
  assertMutationContext(payload.command, "item.undoExit", normalized);
  const db = await getDatabase();
  if (await findReceipt(db, payload.command)) return;
  const now = Date.now();
  assertExitFinancialCandidate(
    await loadFinancialState(db, payload.itemId),
    null,
  );
  let sql = `DELETE FROM item_exits WHERE item_id=?;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;
    UPDATE items SET revision=revision+1,updated_at=? WHERE id=? AND revision=?;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [
    payload.itemId,
    now,
    payload.itemId,
    payload.expectedRevision,
  ];
  ({ sql, args } = appendReceipt(
    sql,
    args,
    payload.command,
    payload.itemId,
    now,
  ));
  try {
    await executeMutationBatch(db, payload.command, payload.itemId, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("Conflict：结束持有记录或物品已变化，请重新加载。");
    throw error;
  }
  notifyDataChanged();
}

async function createCategoryImpl(
  name: string,
  icon: string,
  command: MutationContext,
): Promise<string> {
  const { displayName: trimmed, normalizedName: normalized } =
    normalizeEntityName(name);
  assertEntityNameText(trimmed, "分类名称");
  assertItemoryText(icon || null, "分类图标", {
    maxLength: ITEMORY_ICON_VALUE_MAX_LENGTH,
  });
  const db = await getDatabase();
  const payload = buildCategoryMutationPayload({ name: trimmed, icon });
  assertMutationContext(command, "category.create", payload);
  const replay = await findReceipt(db, command);
  if (replay) return replay;
  const existing = await listCategories();
  if (existing.some((category) => category.normalizedName === normalized))
    throw new Error("已有同名分类");
  const id = newId(),
    now = Date.now(),
    cats = await listCategories();
  const { sql, args } = appendReceipt(
    `INSERT INTO categories(id,name,normalized_name,icon,sort_order,is_system) VALUES(?,?,?,?,?,0);`,
    [
      id,
      trimmed,
      normalized,
      icon,
      Math.max(0, ...cats.map((cat) => cat.sortOrder)) + 1,
    ],
    command,
    id,
    now,
  );
  await executeMutationBatch(db, command, id, sql, args);
  notifyDataChanged();
  return id;
}

async function deleteCategoryImpl(
  id: string,
  command: MutationContext,
): Promise<void> {
  const db = await getDatabase();
  const payload = buildCategoryMutationPayload({ id });
  assertMutationContext(command, "category.delete", payload);
  if (await findReceipt(db, command)) return;
  const now = Date.now();
  let sql = `UPDATE items SET revision=revision+1,updated_at=? WHERE category_id=?;
    DELETE FROM categories WHERE id=? AND is_system=0;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [now, id, id];
  ({ sql, args } = appendReceipt(sql, args, command, id, now));
  try {
    await executeMutationBatch(db, command, id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("分类不存在或不可删除");
    throw error;
  }
  notifyDataChanged();
}

async function createTagImpl(
  name: string,
  color: string,
  command: MutationContext,
): Promise<string> {
  const { displayName: trimmed, normalizedName: normalized } =
    normalizeEntityName(name);
  assertEntityNameText(trimmed, "标签名称");
  const db = await getDatabase();
  const payload = buildTagMutationPayload({ name: trimmed, color });
  assertMutationContext(command, "tag.create", payload);
  const replay = await findReceipt(db, command);
  if (replay) return replay;
  const existing = await listTags();
  if (existing.some((tag) => tag.normalizedName === normalized))
    throw new Error("已有同名标签");
  const id = newId(),
    now = Date.now(),
    tags = await listTags();
  const { sql, args } = appendReceipt(
    `INSERT INTO tags(id,name,normalized_name,color,sort_order) VALUES(?,?,?,?,?);`,
    [id, trimmed, normalized, color, tags.length + 1],
    command,
    id,
    now,
  );
  await executeMutationBatch(db, command, id, sql, args);
  notifyDataChanged();
  return id;
}

async function updateTagImpl(
  id: string,
  updates: { name?: string; color?: string },
  command: MutationContext,
): Promise<void> {
  const normalizedName = updates.name
    ? normalizeEntityName(updates.name)
    : null;
  if (normalizedName)
    assertEntityNameText(normalizedName.displayName, "标签名称");
  const db = await getDatabase();
  const payload = buildTagMutationPayload({ id, ...updates });
  assertMutationContext(command, "tag.update", payload);
  if (await findReceipt(db, command)) return;
  const name = normalizedName?.displayName ?? null;
  const normalized = normalizedName?.normalizedName ?? null;
  const color = updates.color || null;
  const now = Date.now();
  let sql = `UPDATE tags SET name=COALESCE(?,name),normalized_name=COALESCE(?,normalized_name),color=COALESCE(?,color) WHERE id=?;
    INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;
    UPDATE items SET revision=revision+1,updated_at=? WHERE id IN (SELECT item_id FROM item_tags WHERE tag_id=?);`;
  let args: SQLite.DatabaseValue[] = [name, normalized, color, id, now, id];
  ({ sql, args } = appendReceipt(sql, args, command, id, now));
  try {
    await executeMutationBatch(db, command, id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("标签不存在或不可修改");
    throw error;
  }
  notifyDataChanged();
}

async function deleteTagImpl(
  id: string,
  command: MutationContext,
): Promise<void> {
  const db = await getDatabase();
  const payload = buildTagMutationPayload({ id });
  assertMutationContext(command, "tag.delete", payload);
  if (await findReceipt(db, command)) return;
  const now = Date.now();
  let sql = `UPDATE items SET revision=revision+1,updated_at=? WHERE id IN (SELECT item_id FROM item_tags WHERE tag_id=?);
    DELETE FROM tags WHERE id=?;INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [now, id, id];
  ({ sql, args } = appendReceipt(sql, args, command, id, now));
  try {
    await executeMutationBatch(db, command, id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1")) throw new Error("标签不存在");
    throw error;
  }
  notifyDataChanged();
}

async function updateCategoryImpl(
  id: string,
  updates: { name?: string; icon?: string },
  command: MutationContext,
): Promise<void> {
  const normalizedName = updates.name
    ? normalizeEntityName(updates.name)
    : null;
  if (normalizedName)
    assertEntityNameText(normalizedName.displayName, "分类名称");
  const icon = updates.icon || null;
  assertItemoryText(icon, "分类图标", {
    maxLength: ITEMORY_ICON_VALUE_MAX_LENGTH,
  });
  const db = await getDatabase();
  const payload = buildCategoryMutationPayload({ id, ...updates });
  assertMutationContext(command, "category.update", payload);
  if (await findReceipt(db, command)) return;
  const name = normalizedName?.displayName ?? null;
  const normalized = normalizedName?.normalizedName ?? null;
  const now = Date.now();
  let sql = `UPDATE categories SET name=COALESCE(?,name),normalized_name=COALESCE(?,normalized_name),icon=COALESCE(?,icon) WHERE id=? AND is_system=0;
    INSERT INTO cas_check SELECT changes();DELETE FROM cas_check;`;
  let args: SQLite.DatabaseValue[] = [name, normalized, icon, id];
  ({ sql, args } = appendReceipt(sql, args, command, id, now));
  try {
    await executeMutationBatch(db, command, id, sql, args);
  } catch (error) {
    if (String(error).includes("ok = 1"))
      throw new Error("分类不存在或不可修改");
    throw error;
  }
  notifyDataChanged();
}

// Public commands serialize validation, reads and writes as one unit.
export const createItem = (
  ...args: Parameters<typeof createItemImpl>
): ReturnType<typeof createItemImpl> =>
  coordinateMutation(() => createItemImpl(...args));
export const updateItem = (
  ...args: Parameters<typeof updateItemImpl>
): ReturnType<typeof updateItemImpl> =>
  coordinateMutation(() => updateItemImpl(...args));
export const deleteItem = (
  ...args: Parameters<typeof deleteItemImpl>
): ReturnType<typeof deleteItemImpl> =>
  coordinateMutation(() => deleteItemImpl(...args));
export const addMoneyEntry = (
  ...args: Parameters<typeof addMoneyEntryImpl>
): ReturnType<typeof addMoneyEntryImpl> =>
  coordinateMutation(() => addMoneyEntryImpl(...args));
export const updateMoneyEntry = (
  ...args: Parameters<typeof updateMoneyEntryImpl>
): ReturnType<typeof updateMoneyEntryImpl> =>
  coordinateMutation(() => updateMoneyEntryImpl(...args));
export const deleteMoneyEntry = (
  ...args: Parameters<typeof deleteMoneyEntryImpl>
): ReturnType<typeof deleteMoneyEntryImpl> =>
  coordinateMutation(() => deleteMoneyEntryImpl(...args));
export const exitItem = (
  ...args: Parameters<typeof exitItemImpl>
): ReturnType<typeof exitItemImpl> =>
  coordinateMutation(() => exitItemImpl(...args));
export const undoExit = (
  ...args: Parameters<typeof undoExitImpl>
): ReturnType<typeof undoExitImpl> =>
  coordinateMutation(() => undoExitImpl(...args));
export const createCategory = (
  ...args: Parameters<typeof createCategoryImpl>
): ReturnType<typeof createCategoryImpl> =>
  coordinateMutation(() => createCategoryImpl(...args));
export const deleteCategory = (
  ...args: Parameters<typeof deleteCategoryImpl>
): ReturnType<typeof deleteCategoryImpl> =>
  coordinateMutation(() => deleteCategoryImpl(...args));
export const createTag = (
  ...args: Parameters<typeof createTagImpl>
): ReturnType<typeof createTagImpl> =>
  coordinateMutation(() => createTagImpl(...args));
export const updateTag = (
  ...args: Parameters<typeof updateTagImpl>
): ReturnType<typeof updateTagImpl> =>
  coordinateMutation(() => updateTagImpl(...args));
export const deleteTag = (
  ...args: Parameters<typeof deleteTagImpl>
): ReturnType<typeof deleteTagImpl> =>
  coordinateMutation(() => deleteTagImpl(...args));
export const updateCategory = (
  ...args: Parameters<typeof updateCategoryImpl>
): ReturnType<typeof updateCategoryImpl> =>
  coordinateMutation(() => updateCategoryImpl(...args));
