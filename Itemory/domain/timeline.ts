import type { ItemExitRecord, ItemRecord, MoneyEntryRecord, TimelineDisplayItem } from "../models/types";

export function buildTimeline(
  item: ItemRecord,
  moneyEntries: MoneyEntryRecord[],
  exit: ItemExitRecord | null
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];

  // 1. 购入派生节点（来自 items 自身，不可单独删除）
  items.push({
    id: `acq-${item.id}`,
    itemId: item.id,
    type: "purchase",
    date: item.acquiredOn,
    title: "购入物品",
    subtitle: null,
    amountMinor: item.acquisitionAmountMinor,
    direction: "expense",
    canEdit: false,
    canDelete: false,
    createdAt: item.createdAt,
  });

  // 2. 资金流水
  for (const m of moneyEntries) {
    items.push({
      id: m.id,
      itemId: item.id,
      type: m.direction === "expense" ? "money_expense" : "money_income",
      date: m.occurredOn,
      title: m.title,
      subtitle: m.note,
      amountMinor: m.amountMinor,
      direction: m.direction,
      kind: m.kind,
      isPostExitSettlement: exit ? m.occurredOn > exit.exitedOn : false,
      canEdit: true,
      canDelete: true,
      createdAt: m.createdAt,
    });
  }

  // 3. 结束持有派生节点
  if (exit) {
    const reasonTextMap: Record<string, string> = {
      sold: "出售物品",
      gifted: "赠送物品",
      discarded: "丢弃物品",
      lost: "物品遗失",
    };
    items.push({
      id: `exit-${item.id}`,
      itemId: item.id,
      type: "exit",
      date: exit.exitedOn,
      title: reasonTextMap[exit.reason] || "结束持有",
      subtitle: exit.note,
      amountMinor: exit.recoveryAmountMinor,
      direction: "income",
      reason: exit.reason,
      canEdit: true,
      canDelete: false,
      createdAt: exit.createdAt,
    });
  }

  // 统一按发生日期降序，同一天按创建时间降序
  return items.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });
}
