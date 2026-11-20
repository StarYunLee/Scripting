import type { Color } from "scripting";

export type ItemCondition = "in_use" | "idle" | "damaged";
export type ExitReason = "sold" | "gifted" | "discarded" | "lost";
export type EffectiveItemStatus = ItemCondition | ExitReason;
export type InventoryStatusFilter = EffectiveItemStatus | "all";

export type MoneyEntryKind = "accessory" | "maintenance" | "repair" | "upgrade" | "other";
export type MoneyDirection = "expense" | "income";

export interface ItemRecord {
  id: string;
  name: string;
  categoryId: string | null;
  acquiredOn: string; // YYYY-MM-DD
  acquisitionAmountMinor: number | null; // 整数分, null=未知, 0=免费
  holdingCondition: ItemCondition;
  iconSymbol: string | null;
  coverAssetId: string | null;
  channel: string | null;
  warrantyUntil: string | null; // YYYY-MM-DD
  valuationMinor: number | null; // 估值分
  notes: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ItemExitRecord {
  itemId: string;
  reason: ExitReason;
  exitedOn: string; // YYYY-MM-DD
  recoveryAmountMinor: number | null; // 转手回收金额(分)
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
  normalizedName: string;
  icon: string;
  sortOrder: number;
  isSystem: boolean;
}

export interface TagRecord {
  id: string;
  name: string;
  normalizedName: string;
  color: string;
  sortOrder: number;
}

export interface MoneyEntryRecord {
  id: string;
  itemId: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountMinor: number; // 必须 > 0
  occurredOn: string; // YYYY-MM-DD
  title: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

// 统一的派生时间轴项（聚合 items 初始购入、money_entries、item_exits）
export type TimelineItemType = "purchase" | "money_expense" | "money_income" | "exit";

export interface TimelineDisplayItem {
  id: string;
  itemId: string;
  type: TimelineItemType;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle?: string | null;
  amountMinor?: number | null;
  direction?: MoneyDirection;
  kind?: MoneyEntryKind;
  reason?: ExitReason;
  isPostExitSettlement?: boolean;
  canEdit: boolean; // purchase 和 exit 通过专有动作编辑，其他直接编辑
  canDelete: boolean;
  createdAt: number;
}

// 财务与陪伴统计
export interface CostSummary {
  available: boolean;
  unavailableReason?: string | null;
  totalExpenseMinor: number; // 累计总投入
  totalIncomeMinor: number;  // 累计回收
  netCostMinor: number;       // 净支出 (允许为负，表示净收益)
  holdingDays: number | null; // 合法陪伴天数 (>= 1)；日期异常时不可用
  dailyCostMinor: number;     // 每日陪伴成本
  isAcquisitionPriceKnown: boolean; // 是否已知购入价
  isExitPriceKnown: boolean;        // 若已退出，是否已知转手价
}

// 列表卡片数据传输对象
export interface ItemCardViewData {
  item: ItemRecord;
  category: CategoryRecord | null;
  tags: TagRecord[];
  exit: ItemExitRecord | null;
  isExited: boolean;
  effectiveStatus: EffectiveItemStatus;
  summary: CostSummary;
  coverPath: string | null;
}

// 详情页全量数据对象
export interface ItemDetailViewData {
  item: ItemRecord;
  category: CategoryRecord | null;
  tags: TagRecord[];
  exit: ItemExitRecord | null;
  isExited: boolean;
  effectiveStatus: EffectiveItemStatus;
  timeline: TimelineDisplayItem[];
  summary: CostSummary;
  coverPath: string | null;
}

// 预设系统分类常量
export const DEFAULT_CATEGORIES: readonly { id: string; name: string; icon: string; sortOrder: number }[] = [
  { id: "digital", name: "数码电子", icon: "laptopcomputer", sortOrder: 1 },
  { id: "appliance", name: "家用电器", icon: "refrigerator.fill", sortOrder: 2 },
  { id: "home", name: "家具家居", icon: "sofa.fill", sortOrder: 3 },
  { id: "wearable", name: "服饰配件", icon: "tshirt.fill", sortOrder: 4 },
  { id: "transport", name: "交通工具", icon: "car.fill", sortOrder: 5 },
  { id: "outdoor", name: "运动户外", icon: "tent.fill", sortOrder: 6 },
  { id: "tool", name: "工具设备", icon: "hammer.fill", sortOrder: 7 },
  { id: "collection", name: "文娱收藏", icon: "books.vertical.fill", sortOrder: 8 },
  { id: "other", name: "其他", icon: "shippingbox.fill", sortOrder: 9 },
];

export const TAG_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF3B30",
  "#AF52DE",
  "#5856D6",
  "#FF2D55",
  "#8E8E93",
] as const;

export interface ItemStatusMeta {
  label: string;
  color: Color;
  icon: string;
}

export const EFFECTIVE_ITEM_STATUSES: readonly EffectiveItemStatus[] = [
  "in_use",
  "idle",
  "damaged",
  "sold",
  "gifted",
  "discarded",
  "lost",
];

export const ITEM_STATUS_META: Record<EffectiveItemStatus, ItemStatusMeta> = {
  in_use: { label: "在用", color: "#34C759", icon: "checkmark.circle.fill" },
  idle: { label: "闲置", color: "#8E8E93", icon: "pause.circle.fill" },
  damaged: { label: "损坏", color: "#FF9500", icon: "exclamationmark.triangle.fill" },
  sold: { label: "已出售", color: "#007AFF", icon: "banknote.fill" },
  gifted: { label: "已赠送", color: "#AF52DE", icon: "gift.fill" },
  discarded: { label: "已丢弃", color: "#A2845E", icon: "trash.fill" },
  lost: { label: "已遗失", color: "#FF3B30", icon: "questionmark.circle.fill" },
};

export const ITEM_CONDITION_OPTIONS: readonly { id: ItemCondition; label: string }[] = [
  { id: "in_use", label: ITEM_STATUS_META.in_use.label },
  { id: "idle", label: ITEM_STATUS_META.idle.label },
  { id: "damaged", label: ITEM_STATUS_META.damaged.label },
];

export function isDefaultCategory(id: string): boolean {
  return DEFAULT_CATEGORIES.some((c) => c.id === id);
}

export function effectiveItemStatus(item: ItemRecord, exit?: ItemExitRecord | null): EffectiveItemStatus {
  return exit?.reason ?? item.holdingCondition;
}

export function itemStatusMeta(item: ItemRecord, exit?: ItemExitRecord | null): ItemStatusMeta {
  return ITEM_STATUS_META[effectiveItemStatus(item, exit)];
}

export function itemStatusBadge(item: ItemRecord, exit?: ItemExitRecord | null): { label: string; color: Color } {
  const meta = itemStatusMeta(item, exit);
  return { label: meta.label, color: meta.color };
}

export const TIMELINE_TYPE_LABELS: Record<string, { label: string; icon: string; color: Color }> = {
  purchase: { label: "购入物品", icon: "bag.fill", color: "#007AFF" },
  money_expense: { label: "支出", icon: "creditcard.fill", color: "#007AFF" },
  money_income: { label: "收入", icon: "banknote.fill", color: "#34C759" },
  exit: { label: "结束持有", icon: "stop.circle.fill", color: "#8E8E93" },
};


export const EXPENSE_KIND_ICONS: Record<MoneyEntryKind, string> = {
  accessory: "puzzlepiece.fill",
  maintenance: "sparkles",
  repair: "wrench.adjustable.fill",
  upgrade: "cpu.fill",
  other: "creditcard.fill",
};

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  sold: "出售",
  gifted: "赠送",
  discarded: "丢弃",
  lost: "遗失",
};
