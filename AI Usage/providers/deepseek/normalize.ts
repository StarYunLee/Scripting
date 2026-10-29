import type { UsageWindowView } from "../../models";
import type { NormalizedUsageSnapshot } from "../../services/usage-model";
import {
  BALANCE_WINDOW_LABEL,
  BALANCE_WINDOW_PREFIX,
  sanitizeBalanceView,
} from "./usage-parser";
import type { UsageSnapshot } from "./types";

/**
 * 余额窗口直接以 balance 字段表达，不经过百分比/重置时间；
 * 重建时校验币种与金额，交给共享快照清洗保留结构化余额。
 */
export function normalizeUsageSnapshot(
  snapshot: UsageSnapshot,
): NormalizedUsageSnapshot {
  const windows: UsageWindowView[] = [];
  const seen = new Set<string>();
  for (const window of Array.isArray(snapshot.windows)
    ? snapshot.windows
    : []) {
    const balance = sanitizeBalanceView(window?.balance);
    if (!balance || seen.has(balance.currency)) continue;
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
  return {
    planLabel: snapshot.planLabel || "API",
    windows,
    resetCredits: null,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}
