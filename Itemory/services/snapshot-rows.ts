import type { CategoryRecord, ItemExitRecord, ItemRecord, MoneyEntryRecord, TagRecord } from "../models/types";

export type SnapshotRow = {
  kind: "item" | "category" | "tag" | "money" | "exit" | "meta";
  id: string | null; item_id: string | null;
  s1: string | null; s2: string | null; s3: string | null; s4: string | null; s5: string | null;
  s6: string | null; s7: string | null; s8: string | null; s9: string | null;
  n1: number | null; n2: number | null; n3: number | null; n4: number | null; n5: number | null; n6: number | null;
};

export const SNAPSHOT_COLUMNS = "kind,id,item_id,s1,s2,s3,s4,s5,s6,s7,s8,s9,n1,n2,n3,n4,n5,n6";
export const NULL_SNAPSHOT_COLUMNS = "NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL";

function required<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`数据异常：快照缺少 ${field}`);
  return value;
}

export function mapSnapshotItem(row: SnapshotRow): ItemRecord {
  return {
    id: required(row.id, "物品ID"), name: required(row.s1, "物品名称"), categoryId: row.s2,
    acquiredOn: required(row.s3, "购入日期"), acquisitionAmountMinor: row.n1,
    holdingCondition: required(row.s4, "持有状态") as ItemRecord["holdingCondition"],
    iconSymbol: row.s5, coverAssetId: row.s6, channel: row.s7, warrantyUntil: row.s8,
    valuationMinor: row.n2, notes: row.s9, revision: required(row.n3, "修订号"),
    createdAt: required(row.n4, "创建时间"), updatedAt: required(row.n5, "更新时间"),
  };
}
export function mapSnapshotCategory(row: SnapshotRow): CategoryRecord {
  return { id: required(row.id,"分类ID"), name: required(row.s1,"分类名称"), normalizedName: required(row.s2,"规范名"), icon: required(row.s3,"分类图标"), sortOrder: required(row.n1,"分类排序"), isSystem: row.n2 === 1 };
}
export function mapSnapshotTag(row: SnapshotRow): TagRecord {
  return { id: required(row.id,"标签ID"), name: required(row.s1,"标签名称"), normalizedName: required(row.s2,"规范名"), color: required(row.s3,"标签颜色"), sortOrder: required(row.n1,"标签排序") };
}
export function mapSnapshotMoney(row: SnapshotRow): MoneyEntryRecord {
  return { id: required(row.id,"资金ID"), itemId: required(row.item_id,"物品ID"), direction: required(row.s1,"资金方向") as MoneyEntryRecord["direction"], kind: required(row.s2,"资金类型") as MoneyEntryRecord["kind"], occurredOn: required(row.s3,"资金日期"), title: required(row.s4,"资金标题"), note: row.s5, amountMinor: required(row.n1,"资金金额"), createdAt: required(row.n2,"创建时间"), updatedAt: required(row.n3,"更新时间") };
}
export function mapSnapshotExit(row: SnapshotRow): ItemExitRecord {
  return { itemId: required(row.item_id,"物品ID"), reason: required(row.s1,"结束原因") as ItemExitRecord["reason"], exitedOn: required(row.s2,"结束日期"), note: row.s3, recoveryAmountMinor: row.n1, createdAt: required(row.n2,"创建时间"), updatedAt: required(row.n3,"更新时间") };
}
