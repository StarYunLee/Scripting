import type { UsageBalanceView } from "../../models";
import { normalizeAmount, normalizeCurrencyCode } from "./format";
import type { DeepseekBalanceWindow } from "./types";

export const BALANCE_WINDOW_LABEL = "账户余额";
export const BALANCE_WINDOW_PREFIX = "deepseek:balance:";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 十进制字符串的规范形，用于判定重复币种是否真的冲突（不做浮点换算）。 */
function canonicalAmount(value: string): string {
  const [integerRaw, fractionRaw = ""] = value.split(".");
  const integer = integerRaw.replace(/^0+/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

/**
 * 可选金额：缺失/null/空串视为 null（不补 0）；出现但非法则整体拒绝。
 * 返回 undefined 表示“字段存在但非法”。
 */
function optionalAmount(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const amount = normalizeAmount(value);
  return amount ?? undefined;
}

function balanceFromRow(
  row: Record<string, unknown>,
  isAvailable: boolean,
): UsageBalanceView | null {
  const currency = normalizeCurrencyCode(row.currency);
  if (!currency) return null;
  const total = normalizeAmount(row.total_balance);
  if (!total) return null;
  const granted = optionalAmount(row.granted_balance);
  if (granted === undefined) return null;
  const paid = optionalAmount(row.topped_up_balance);
  if (paid === undefined) return null;
  return { currency, total, paid, granted, isAvailable };
}

/**
 * 解析官方 GET /user/balance 响应。
 * required：is_available 必须是 boolean、balance_infos 必须是非空数组、
 * 每行 currency 必须是三字母 code、total_balance 必须是合法非负十进制字符串。
 * 任一 required 非法即返回 null（拒绝响应），绝不补 0 或猜值。
 */
export function parseBalancePayload(
  payload: unknown,
): UsageBalanceView[] | null {
  const root = asObject(payload);
  if (!root) return null;
  if (typeof root.is_available !== "boolean") return null;
  const rows = root.balance_infos;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const balances: UsageBalanceView[] = [];
  const byCurrency = new Map<string, UsageBalanceView>();
  for (const raw of rows) {
    const row = asObject(raw);
    if (!row) return null;
    const balance = balanceFromRow(row, root.is_available);
    if (!balance) return null;
    const existing = byCurrency.get(balance.currency);
    if (existing) {
      // 同一币种重复出现：完全一致才去重，数值冲突则拒绝整份响应。
      if (
        canonicalAmount(existing.total) !== canonicalAmount(balance.total) ||
        (existing.paid == null) !== (balance.paid == null) ||
        (existing.granted == null) !== (balance.granted == null) ||
        (existing.paid != null &&
          balance.paid != null &&
          canonicalAmount(existing.paid) !== canonicalAmount(balance.paid)) ||
        (existing.granted != null &&
          balance.granted != null &&
          canonicalAmount(existing.granted) !== canonicalAmount(balance.granted))
      ) {
        return null;
      }
      continue;
    }
    byCurrency.set(balance.currency, balance);
    balances.push(balance);
  }
  return balances;
}

/** 缓存/展示层的余额视图清洗；非法返回 null，不伪造字段。 */
export function sanitizeBalanceView(value: unknown): UsageBalanceView | null {
  const row = asObject(value);
  if (!row) return null;
  const currency = normalizeCurrencyCode(row.currency);
  if (!currency) return null;
  const total = normalizeAmount(row.total);
  if (!total) return null;
  const granted = optionalAmount(row.granted);
  if (granted === undefined) return null;
  const paid = optionalAmount(row.paid);
  if (paid === undefined) return null;
  if (typeof row.isAvailable !== "boolean") return null;
  return { currency, total, paid, granted, isAvailable: row.isAvailable };
}

/** 每币种一个 balance 窗口；没有百分比、resetAt 或额度上限。 */
export function buildBalanceWindows(
  balances: UsageBalanceView[],
): DeepseekBalanceWindow[] {
  const windows: DeepseekBalanceWindow[] = [];
  const seen = new Set<string>();
  for (const balance of balances) {
    if (seen.has(balance.currency)) continue;
    seen.add(balance.currency);
    windows.push({
      id: `${BALANCE_WINDOW_PREFIX}${balance.currency}`,
      label: BALANCE_WINDOW_LABEL,
      usedPercent: null,
      remainingPercent: null,
      resetAt: null,
      kind: "balance",
      balance,
    });
  }
  return windows;
}
