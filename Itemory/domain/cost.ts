import type { CostSummary, ItemExitRecord, ItemRecord, MoneyEntryRecord } from "../models/types";
import { assertExitRecord, assertItemRecord, assertMoneyRecord, assertSafeMinor, safeAddMinor, safeSubtractMinor } from "./validation";
import { calendarHoldingDays, isValidYmd, todayYmd } from "../services/format";

export function unavailableCostSummary(item: ItemRecord, exit: ItemExitRecord | null, reason: unknown): CostSummary {
  // 降级路径独立验证日期，不复用可能继续抛错的脏值计算。
  let days: number | null = null;
  try {
    const today = todayYmd();
    if (isValidYmd(item.acquiredOn) && item.acquiredOn <= today &&
        (!exit || (isValidYmd(exit.exitedOn) && exit.exitedOn >= item.acquiredOn && exit.exitedOn <= today))) {
      days = calendarHoldingDays(item.acquiredOn, exit?.exitedOn);
    }
  } catch { /* 原始记录保留；日期不可用，不伪装为 0 天。 */ }
  return { available:false, unavailableReason: reason instanceof Error ? reason.message : String(reason), totalExpenseMinor:0,totalIncomeMinor:0,netCostMinor:0,holdingDays:days,dailyCostMinor:0,isAcquisitionPriceKnown:item.acquisitionAmountMinor!==null,isExitPriceKnown:exit?.reason==='sold'?exit.recoveryAmountMinor!==null:true };
}

export function calculateCostSummary(
  item: ItemRecord,
  moneyEntries: MoneyEntryRecord[],
  exit: ItemExitRecord | null
): CostSummary {
  const isAcquisitionPriceKnown = item.acquisitionAmountMinor !== null;
  assertItemRecord(item);
  const initialCost = assertSafeMinor(item.acquisitionAmountMinor, "购入金额");

  let totalExpenseMinor = initialCost ?? 0;
  let totalIncomeMinor = 0;

  for (const entry of moneyEntries) {
    assertMoneyRecord(entry, item.acquiredOn);
    if (entry.direction === "expense") {
      totalExpenseMinor = safeAddMinor(totalExpenseMinor, entry.amountMinor, "累计投入");
    } else if (entry.direction === "income") {
      totalIncomeMinor = safeAddMinor(totalIncomeMinor, entry.amountMinor, "累计收入");
    }
  }

  const isExitPriceKnown = exit?.reason === "sold"
    ? exit.recoveryAmountMinor !== null
    : true;
  if (exit) {
    assertExitRecord(exit, item.acquiredOn);
    if (exit.recoveryAmountMinor !== null) {
      totalIncomeMinor = safeAddMinor(totalIncomeMinor, exit.recoveryAmountMinor, "累计收入");
    }
  }

  const netCostMinor = safeSubtractMinor(totalExpenseMinor, totalIncomeMinor, "净支出");
  const days = calendarHoldingDays(item.acquiredOn, exit?.exitedOn);
  const dailyCostMinor = Math.round(netCostMinor / days);
  if (!Number.isSafeInteger(dailyCostMinor)) throw new Error("日均成本超出安全范围");

  return {
    available: true,
    unavailableReason: null,
    totalExpenseMinor,
    totalIncomeMinor,
    netCostMinor,
    holdingDays: days,
    dailyCostMinor,
    isAcquisitionPriceKnown,
    isExitPriceKnown,
  };
}
