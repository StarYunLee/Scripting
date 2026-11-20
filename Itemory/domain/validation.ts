import type {
  ExitReason,
  ItemCondition,
  ItemExitRecord,
  ItemRecord,
  MoneyDirection,
  MoneyEntryKind,
  MoneyEntryRecord,
} from "../models/types";
import { isValidYmd, todayYmd } from "../services/format";
import {
  ITEMORY_ICON_VALUE_MAX_LENGTH,
  ITEMORY_NAME_MAX_LENGTH,
  assertItemoryText,
} from "./text-limits";

const CONDITIONS = new Set<ItemCondition>(["in_use", "idle", "damaged"]);
const EXIT_REASONS = new Set<ExitReason>([
  "sold",
  "gifted",
  "discarded",
  "lost",
]);
const DIRECTIONS = new Set<MoneyDirection>(["expense", "income"]);
const MONEY_KINDS = new Set<MoneyEntryKind>([
  "accessory",
  "maintenance",
  "repair",
  "upgrade",
  "other",
]);

export function normalizeEntityName(value: string): {
  displayName: string;
  normalizedName: string;
} {
  const displayName = value.trim().normalize("NFC");
  if (!displayName) throw new Error("名称不能为空");
  return { displayName, normalizedName: displayName.toLowerCase() };
}

export function uniqueSortedIds(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

// 以下文本断言只用于“新写入”的持久化候选，与交换格式上限同源。
// 历史数据读取与完整备份的领域校验（assertItemRecord 等）刻意保持原样，
// 不能因为旧库存在超长字段而拒绝读取或恢复。
export interface ItemTextFields {
  name: string;
  channel?: string | null;
  notes?: string | null;
  iconSymbol?: string | null;
}

export function assertItemTextFields(item: ItemTextFields): void {
  assertItemoryText(item.name, "物品名称", {
    maxLength: ITEMORY_NAME_MAX_LENGTH,
  });
  assertItemoryText(item.channel ?? null, "购入渠道");
  assertItemoryText(item.notes ?? null, "物品备注");
  assertItemoryText(item.iconSymbol ?? null, "物品图标", {
    maxLength: ITEMORY_ICON_VALUE_MAX_LENGTH,
  });
}

export function assertMoneyTextFields(entry: {
  title: string;
  note?: string | null;
}): void {
  assertItemoryText(entry.title, "事项标题", {
    maxLength: ITEMORY_NAME_MAX_LENGTH,
  });
  assertItemoryText(entry.note ?? null, "事项备注");
}

export function assertEntityNameText(name: string, field: string): void {
  assertItemoryText(name, field, { maxLength: ITEMORY_NAME_MAX_LENGTH });
}

export function assertSafeMinor(
  value: number | null | undefined,
  field: string,
  options: { nullable?: boolean; positive?: boolean } = {},
): number | null {
  if (value === null || value === undefined) {
    if (options.nullable !== false) return null;
    throw new Error(`${field}不能为空`);
  }
  if (!Number.isSafeInteger(value)) throw new Error(`${field}必须为安全整数分`);
  if (options.positive ? value <= 0 : value < 0) {
    throw new Error(
      `${field}${options.positive ? "必须大于 0" : "不能为负数"}`,
    );
  }
  return value;
}

export function safeAddMinor(
  left: number,
  right: number,
  field = "金额汇总",
): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${field}超出安全范围`);
  return result;
}

export function safeSubtractMinor(
  left: number,
  right: number,
  field = "净支出",
): number {
  const result = left - right;
  if (!Number.isSafeInteger(result)) throw new Error(`${field}超出安全范围`);
  return result;
}

export function assertBusinessDate(
  value: string,
  field: string,
  options: { min?: string; allowFuture?: boolean } = {},
): string {
  if (!isValidYmd(value)) throw new Error(`${field}格式无效`);
  if (!options.allowFuture && value > todayYmd())
    throw new Error(`${field}不能晚于今天`);
  if (options.min && value < options.min)
    throw new Error(`${field}不能早于购入日期`);
  return value;
}

export function assertItemRecord(item: ItemRecord): void {
  if (!item.id || !item.name.trim())
    throw new Error("数据异常：物品主档缺少 ID 或名称");
  assertBusinessDate(item.acquiredOn, "数据异常：购入日期");
  assertSafeMinor(item.acquisitionAmountMinor, "数据异常：购入金额");
  assertSafeMinor(item.valuationMinor, "数据异常：估值");
  if (!CONDITIONS.has(item.holdingCondition))
    throw new Error("数据异常：未知持有状态");
  if (!Number.isSafeInteger(item.revision) || item.revision < 1)
    throw new Error("数据异常：修订号无效");
  if (item.warrantyUntil !== null && !isValidYmd(item.warrantyUntil)) {
    throw new Error("数据异常：保修日期无效");
  }
}

export function assertMoneyRecord(
  entry: MoneyEntryRecord,
  _acquiredOn?: string,
): void {
  if (!entry.id || !entry.title.trim())
    throw new Error("数据异常：资金记录缺少 ID 或标题");
  if (!DIRECTIONS.has(entry.direction))
    throw new Error("数据异常：未知资金方向");
  if (!MONEY_KINDS.has(entry.kind)) throw new Error("数据异常：未知资金类型");
  assertSafeMinor(entry.amountMinor, "数据异常：资金金额", {
    nullable: false,
    positive: true,
  });
  assertBusinessDate(entry.occurredOn, "数据异常：资金日期");
}

export function assertExitRecord(
  exit: ItemExitRecord,
  acquiredOn: string,
): void {
  if (!EXIT_REASONS.has(exit.reason)) throw new Error("数据异常：未知退出原因");
  assertBusinessDate(exit.exitedOn, "数据异常：结束日期", { min: acquiredOn });
  assertSafeMinor(exit.recoveryAmountMinor, "数据异常：回收金额");
  if (exit.reason !== "sold" && exit.recoveryAmountMinor !== null) {
    throw new Error("数据异常：非转手退出不应包含回收金额");
  }
}

export function isMoneyDirection(value: unknown): value is MoneyDirection {
  return DIRECTIONS.has(value as MoneyDirection);
}

export function isMoneyEntryKind(value: unknown): value is MoneyEntryKind {
  return MONEY_KINDS.has(value as MoneyEntryKind);
}

export function isItemCondition(value: unknown): value is ItemCondition {
  return CONDITIONS.has(value as ItemCondition);
}

export function isExitReason(value: unknown): value is ExitReason {
  return EXIT_REASONS.has(value as ExitReason);
}
