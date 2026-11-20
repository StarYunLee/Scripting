import { timeStartupStep } from "./startup-timing";
import type {
  CategoryRecord,
  EffectiveItemStatus,
  ItemExitRecord,
  ItemRecord,
  MoneyEntryKind,
  MoneyEntryRecord,
} from "../models/types";
import {
  EFFECTIVE_ITEM_STATUSES,
  ITEM_STATUS_META,
  effectiveItemStatus,
} from "../models/types";
import { calculateCostSummary, unavailableCostSummary } from "../domain/cost";
import { safeAddMinor, safeSubtractMinor } from "../domain/validation";
import { calendarHoldingDays, isValidYmd, todayYmd } from "./format";
import { getDatabase } from "./db";
import { resolveCoverPath } from "./covers";
import {
  mapSnapshotCategory,
  mapSnapshotExit,
  mapSnapshotItem,
  mapSnapshotMoney,
  type SnapshotRow,
} from "./snapshot-rows";

export type StatisticsPeriod = "all" | string; // "all" | "2026" | "2025" | ...

export interface StatisticsRange {
  period: StatisticsPeriod;
  from: string | null;
  to: string;
  label: string;
}

export interface StatisticsStatusCount {
  key: EffectiveItemStatus;
  label: string;
  color: string;
  count: number;
}

export interface StatisticsCategory {
  id: string | null;
  name: string;
  icon: string;
  itemCount: number;
  knownExpenseMinor: number | null;
  currentValuationMinor: number | null;
  valuationCount: number;
}

export interface StatisticsExpenseKind {
  key: MoneyEntryKind;
  label: string;
  icon: string;
  color: string;
  amountMinor: number | null;
  count: number;
}

export interface StatisticsCashFlowBucket {
  key: string;
  label: string;
  expenseMinor: number | null;
  incomeMinor: number | null;
  acquisitionMinor: number | null;
  extraExpenseMinor: number | null;
  incomeEntryMinor: number | null;
  recoveryMinor: number | null;
}

export interface StatisticsCashFlow {
  buckets: StatisticsCashFlowBucket[];
  expenseMinor: number | null;
  incomeMinor: number | null;
  netMinor: number | null;
  acquisitionMinor: number | null;
  extraExpenseMinor: number | null;
  incomeEntryMinor: number | null;
  recoveryMinor: number | null;
}

export interface StatisticsHoldingBucket {
  label: string;
  count: number;
}

export interface StatisticsLifecycle {
  averageCurrentHoldingDays: number | null;
  longestCurrentHoldingDays: number | null;
  knownHoldingCount: number;
  unavailableHoldingCount: number;
  holdingBuckets: StatisticsHoldingBucket[];
}

export interface StatisticsRankingItem {
  itemId: string;
  name: string;
  iconSymbol: string;
  coverPath: string | null;
  purchaseAmountMinor: number | null;
  status: EffectiveItemStatus;
  amountMinor: number;
  holdingDays: number | null;
}

export interface StatisticsRankings {
  topExpense: StatisticsRankingItem[];
  bottomExpense: StatisticsRankingItem[];
  topDailyCost: StatisticsRankingItem[];
  bottomDailyCost: StatisticsRankingItem[];
  topHoldingTime: StatisticsRankingItem[];
  bottomHoldingTime: StatisticsRankingItem[];
}

export interface StatisticsAlerts {
  warrantyExpired: number;
  warrantyExpiringSoon: number;
  idleCount: number;
  damagedCount: number;
  unknownAcquisitionCount: number;
  missingValuationCount: number;
  missingSoldRecoveryCount: number;
  uncategorizedCount: number;
}

export interface StatisticsSnapshot {
  amountStatus: "valid" | "partial" | "unavailable";
  totalItemCount: number;
  activeCount: number;
  endedCount: number;
  addedCount: number; // 期间新增购入件数
  endedCountInPeriod: number; // 期间结束持有件数
  totalExpenseMinor: number | null;
  totalIncomeMinor: number | null;
  netCostMinor: number | null;
  currentExpenseMinor: number | null;
  currentDailyCostMinor: number | null;
  periodDailyExpenseMinor: number | null; // 期间日均花销 (期间总支出 / 期间在账天数)
  currentValuationMinor: number | null;
  valuationCount: number;
  valuationTotalCount: number;
  valuationComparableGapMinor: number | null;
  valuationComparableCount: number;
  knownAmountCount: number;
  amountRelevantCount: number;
  unavailableAmountCount: number;
}

export interface StatisticsReport {
  overflowMetrics: string[]; // 聚合超界指标；对应金额为 null，不是 0 或截断值
  range: StatisticsRange;
  availableYears: string[]; // 所有有记录的年份，降序排，例如 ["2026", "2025", "2024"]
  snapshot: StatisticsSnapshot;
  statuses: StatisticsStatusCount[];
  categories: StatisticsCategory[];
  expenseKinds: StatisticsExpenseKind[];
  cashFlow: StatisticsCashFlow;
  lifecycle: StatisticsLifecycle;
  rankings: StatisticsRankings;
  alerts: StatisticsAlerts;
}

type ItemAnalysis = {
  item: ItemRecord;
  money: MoneyEntryRecord[];
  exit: ItemExitRecord | null;
  summary: ReturnType<typeof calculateCostSummary>;
  category: CategoryRecord | null;
};

const EXPENSE_META: Record<
  MoneyEntryKind,
  { label: string; icon: string; color: string }
> = {
  accessory: { label: "配件", icon: "puzzlepiece.fill", color: "#007AFF" },
  maintenance: { label: "保养", icon: "sparkles", color: "#34C759" },
  repair: { label: "维修", icon: "wrench.adjustable.fill", color: "#FF9500" },
  upgrade: { label: "升级", icon: "cpu.fill", color: "#AF52DE" },
  other: { label: "其他", icon: "creditcard.fill", color: "#8E8E93" },
};

function ymdParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year, month, day];
}

function ymdFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = ymdParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return ymdFromDate(date);
}

function monthIndex(value: string): number {
  const [year, month] = ymdParts(value);
  return year * 12 + month - 1;
}

function monthDistance(from: string, to: string): number {
  return Math.max(0, monthIndex(to) - monthIndex(from));
}

function resolveRange(
  period: StatisticsPeriod,
  today: string,
): StatisticsRange {
  if (period !== "all" && /^\d{4}$/.test(period)) {
    const year = period;
    return {
      period,
      from: `${year}-01-01`,
      to: year === today.slice(0, 4) ? today : `${year}-12-31`,
      label: `${year} 年`,
    };
  }
  return {
    period: "all",
    from: null,
    to: today,
    label: "全部",
  };
}

function isInRange(value: string, range: StatisticsRange): boolean {
  return value <= range.to && (range.from === null || value >= range.from);
}

/**
 * 计算物品在特定区间内的实际在持天数
 * item 期间持有区间 = [max(item.acquiredOn, range.from), min(exit?.exitedOn ?? range.to, range.to)]
 */
function holdingDaysInRange(
  acquiredOn: string,
  exitedOn: string | null | undefined,
  range: StatisticsRange,
): number {
  const start = range.from
    ? acquiredOn > range.from
      ? acquiredOn
      : range.from
    : acquiredOn;
  const rawEnd = exitedOn ?? range.to;
  const end = rawEnd < range.to ? rawEnd : range.to;
  if (start > end) return 0;
  return calendarHoldingDays(start, end);
}

function statusFor(
  item: ItemRecord,
  exit: ItemExitRecord | null,
): EffectiveItemStatus {
  return effectiveItemStatus(item, exit);
}

function emptyStatusCounts(): StatisticsStatusCount[] {
  return EFFECTIVE_ITEM_STATUSES.map((key) => ({
    key,
    label: ITEM_STATUS_META[key].label,
    color: ITEM_STATUS_META[key].color as string,
    count: 0,
  }));
}

function categoryTemplate(category: CategoryRecord | null): StatisticsCategory {
  return {
    id: category?.id ?? null,
    name: category?.name ?? "未分类",
    icon: category?.icon ?? "questionmark.folder",
    itemCount: 0,
    knownExpenseMinor: 0,
    currentValuationMinor: 0,
    valuationCount: 0,
  };
}

function createBucket(key: string, label: string): StatisticsCashFlowBucket {
  return {
    key,
    label,
    expenseMinor: 0,
    incomeMinor: 0,
    acquisitionMinor: 0,
    extraExpenseMinor: 0,
    incomeEntryMinor: 0,
    recoveryMinor: 0,
  };
}

function bucketKeyFor(value: string, yearly: boolean): string {
  return yearly ? value.slice(0, 4) : value.slice(0, 7);
}

function bucketLabelFor(
  key: string,
  yearly: boolean,
  spanMonths: number,
): string {
  if (yearly) return `${key}年`;
  const [year, month] = key.split("-");
  return spanMonths > 12 ? `${year}年${Number(month)}月` : `${Number(month)}月`;
}

type AggregateMinor = number | null;
type AddAggregate = (a: AggregateMinor, b: AggregateMinor, metric: string) => AggregateMinor;

function aggregateArithmetic(
  a: AggregateMinor,
  b: AggregateMinor,
  metric: string,
  overflow: Set<string>,
  subtract = false,
): AggregateMinor {
  if (a === null || b === null) {
    overflow.add(metric);
    return null;
  }
  try {
    return subtract ? safeSubtractMinor(a, b, metric) : safeAddMinor(a, b, metric);
  } catch {
    overflow.add(metric);
    return null;
  }
}

function addBucketValue(
  buckets: Map<string, StatisticsCashFlowBucket>,
  value: string,
  yearly: boolean,
  spanMonths: number,
  field:
    | "acquisitionMinor"
    | "extraExpenseMinor"
    | "incomeEntryMinor"
    | "recoveryMinor",
  amount: number,
  add: AddAggregate,
): void {
  const key = bucketKeyFor(value, yearly);
  const bucket =
    buckets.get(key) ??
    createBucket(key, bucketLabelFor(key, yearly, spanMonths));
  bucket[field] = add(bucket[field], amount, `bucket:${key}:${field}`);
  bucket.expenseMinor = add(
    bucket.expenseMinor,
    field === "acquisitionMinor" || field === "extraExpenseMinor" ? amount : 0,
    `bucket:${key}:expenseMinor`,
  );
  bucket.incomeMinor = add(
    bucket.incomeMinor,
    field === "incomeEntryMinor" || field === "recoveryMinor" ? amount : 0,
    `bucket:${key}:incomeMinor`,
  );
  buckets.set(key, bucket);
}

function fillCashFlowBuckets(
  buckets: Map<string, StatisticsCashFlowBucket>,
  range: StatisticsRange,
  yearly: boolean,
  allEventYears: string[],
): void {
  if (yearly) {
    // 全部时间：按年统计，补齐从最早年份到最新年份的所有年份
    const years =
      allEventYears.length > 0 ? allEventYears : [range.to.slice(0, 4)];
    const minYear = Number(years[0]);
    const maxYear = Number(years[years.length - 1]);
    for (let y = minYear; y <= maxYear; y++) {
      const key = String(y);
      if (!buckets.has(key)) {
        buckets.set(key, createBucket(key, `${y}年`));
      }
    }
  } else {
    // 具体某一年：严格固定为 12 个月份 (01 到 12)
    const year = range.period;
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, "0");
      const key = `${year}-${monthStr}`;
      if (!buckets.has(key)) {
        buckets.set(key, createBucket(key, `${m}月`));
      }
    }
  }
}

function makeHoldingBuckets(): StatisticsHoldingBucket[] {
  return [
    { label: "30 天以内", count: 0 },
    { label: "31–180 天", count: 0 },
    { label: "181–365 天", count: 0 },
    { label: "1–3 年", count: 0 },
    { label: "3 年以上", count: 0 },
  ];
}

function addHoldingBucket(
  buckets: StatisticsHoldingBucket[],
  days: number,
): void {
  if (days <= 30) buckets[0].count++;
  else if (days <= 180) buckets[1].count++;
  else if (days <= 365) buckets[2].count++;
  else if (days <= 1095) buckets[3].count++;
  else buckets[4].count++;
}

function averageRounded(total: number, count: number): number {
  return count > 0 ? Math.round(total / count) : 0;
}

export async function getStatisticsReport(
  period: StatisticsPeriod = "all",
): Promise<StatisticsReport> {
  return timeStartupStep("statistics first report", () =>
    buildStatisticsReport(period),
  );
}

async function buildStatisticsReport(
  period: StatisticsPeriod,
): Promise<StatisticsReport> {
  const db = await getDatabase();
  const today = todayYmd();
  const range = resolveRange(period, today);
  const overflow = new Set<string>();
  const add: AddAggregate = (a, b, metric) => aggregateArithmetic(a, b, metric, overflow);
  const subtract = (a: AggregateMinor, b: AggregateMinor, metric: string) =>
    aggregateArithmetic(a, b, metric, overflow, true);
  const rows = await db.fetchAll<SnapshotRow>(`
    SELECT 'item' kind,id,NULL item_id,name s1,category_id s2,acquired_on s3,holding_condition s4,icon_symbol s5,cover_asset_id s6,channel s7,warranty_until s8,notes s9,acquisition_amount_minor n1,valuation_minor n2,revision n3,created_at n4,updated_at n5,NULL n6 FROM items
    UNION ALL SELECT 'category',id,NULL,name,normalized_name,icon,NULL,NULL,NULL,NULL,NULL,NULL,sort_order,is_system,NULL,NULL,NULL,NULL FROM categories
    UNION ALL SELECT 'money',id,item_id,direction,kind,occurred_on,title,note,NULL,NULL,NULL,NULL,amount_minor,created_at,updated_at,NULL,NULL,NULL FROM money_entries
    UNION ALL SELECT 'exit',NULL,item_id,reason,exited_on,note,NULL,NULL,NULL,NULL,NULL,NULL,recovery_amount_minor,created_at,updated_at,NULL,NULL,NULL FROM item_exits`);
  const itemRows = rows.filter((row) => row.kind === "item");
  const categoryRows = rows.filter((row) => row.kind === "category");
  const moneyRows = rows.filter((row) => row.kind === "money");
  const exitRows = rows.filter((row) => row.kind === "exit");
  const categories = new Map<string, CategoryRecord>(
    categoryRows.map((row) => {
      const value = mapSnapshotCategory(row);
      return [value.id, value];
    }),
  );
  const exits = new Map<string, ItemExitRecord>(
    exitRows.map((row) => {
      const value = mapSnapshotExit(row);
      return [value.itemId, value];
    }),
  );
  const moneyByItem = new Map<string, MoneyEntryRecord[]>();
  for (const row of moneyRows) {
    const entry = mapSnapshotMoney(row);
    const entries = moneyByItem.get(entry.itemId) ?? [];
    entries.push(entry);
    moneyByItem.set(entry.itemId, entries);
  }

  const analyses: ItemAnalysis[] = itemRows.map((row) => {
    const item = mapSnapshotItem(row);
    const money = moneyByItem.get(item.id) ?? [];
    const exit = exits.get(item.id) ?? null;
    return {
      item,
      money,
      exit,
      summary: (() => {
        try {
          return calculateCostSummary(item, money, exit);
        } catch (error) {
          return unavailableCostSummary(item, exit, error);
        }
      })(),
      category: item.categoryId
        ? (categories.get(item.categoryId) ?? null)
        : null,
    };
  });

  const statusCounts = emptyStatusCounts();
  const statusMap = new Map(statusCounts.map((entry) => [entry.key, entry]));
  const categoryMap = new Map<string, StatisticsCategory>();
  const expenseMap = new Map<MoneyEntryKind, StatisticsExpenseKind>();
  const holdingBuckets = makeHoldingBuckets();

  let currentExpenseMinor: AggregateMinor = 0;
  let currentDailyCostMinor: AggregateMinor = 0;
  let currentValuationMinor: AggregateMinor = 0;
  let valuationCount = 0;
  let valuationComparableGapMinor: AggregateMinor = 0;
  let valuationComparableCount = 0;
  let activeHoldingDays = 0;
  let activeHoldingCount = 0;
  let longestCurrentHoldingDays = 0;

  for (const analysis of analyses) {
    const { item, exit, summary } = analysis;
    const status = statusMap.get(statusFor(item, exit));
    if (status) status.count++;

    // 生命周期不依赖财务字段；只有合法日期才进入天数指标。
    const holdingDays = summary.holdingDays;
    if (!exit && holdingDays !== null) {
      addHoldingBucket(holdingBuckets, holdingDays);
      activeHoldingDays += holdingDays;
      activeHoldingCount++;
      longestCurrentHoldingDays = Math.max(longestCurrentHoldingDays, holdingDays);
    }
    if (!exit && summary.available) {
      currentExpenseMinor = add(
        currentExpenseMinor,
        summary.totalExpenseMinor,
        "currentExpenseMinor",
      );
      currentDailyCostMinor = add(
        currentDailyCostMinor,
        summary.dailyCostMinor,
        "currentDailyCostMinor",
      );
      if (item.valuationMinor !== null) {
        currentValuationMinor = add(
          currentValuationMinor,
          item.valuationMinor,
          "currentValuationMinor",
        );
        valuationCount++;
        if (summary.isAcquisitionPriceKnown) {
          valuationComparableGapMinor = add(
            valuationComparableGapMinor,
            item.valuationMinor - summary.totalExpenseMinor,
            "valuationComparableGapMinor",
          );
          valuationComparableCount++;
        }
      }
    }
  }

  const allRawDates = [
    ...analyses.map((analysis) => analysis.item.acquiredOn),
    ...moneyRows.map((row) => row.s3!),
    ...exitRows.map((row) => row.s2!),
  ].filter((value): value is string => Boolean(value) && isValidYmd(value) && value <= today);
  const yearSet = new Set<string>();
  for (const d of allRawDates) {
    if (d && d.length >= 4) yearSet.add(d.slice(0, 4));
  }
  yearSet.add(today.slice(0, 4));
  const sortedYearsAsc = [...yearSet].sort();
  const availableYears = [...yearSet].sort().reverse();

  const eventDates = allRawDates.filter((value) => isInRange(value, range));
  const firstEvent = eventDates.sort()[0] ?? range.from ?? today;
  const spanStart = range.from ?? firstEvent;
  const spanMonths = monthDistance(spanStart, range.to);
  const yearlyBuckets = period === "all";
  const bucketMap = new Map<string, StatisticsCashFlowBucket>();
  let acquisitionMinor: AggregateMinor = 0;
  let extraExpenseMinor: AggregateMinor = 0;
  let incomeEntryMinor: AggregateMinor = 0;
  let recoveryMinor: AggregateMinor = 0;

  let addedCount = 0;
  let endedCountInPeriod = 0;

  for (const analysis of analyses) {
    const { item, money, exit } = analysis;
    let itemPeriodExpense = 0;
    if (isValidYmd(item.acquiredOn) && item.acquiredOn <= today && isInRange(item.acquiredOn, range)) addedCount++;
    if (exit && isValidYmd(exit.exitedOn) && exit.exitedOn <= today && isInRange(exit.exitedOn, range)) endedCountInPeriod++;
    // 与领域校验同源：未知 null 合法，但实际损坏的记录不贡献财务金额。
    if (!analysis.summary.available) continue;

    // 购入支出与新增件数统计（判断购入日期是否在期间内）
    if (isInRange(item.acquiredOn, range)) {
      if (item.acquisitionAmountMinor !== null) {
        acquisitionMinor = add(
          acquisitionMinor,
          item.acquisitionAmountMinor,
          "acquisitionMinor",
        );
        itemPeriodExpense = safeAddMinor(
          itemPeriodExpense,
          item.acquisitionAmountMinor,
          "物品期间购入",
        );
        addBucketValue(
          bucketMap,
          item.acquiredOn,
          yearlyBuckets,
          spanMonths,
          "acquisitionMinor",
          item.acquisitionAmountMinor,
          add,
        );
      }
    }

    // 额外收支统计（判断发生日期是否在期间内）
    for (const entry of money) {
      if (!isInRange(entry.occurredOn, range)) continue;
      if (entry.direction === "expense") {
        extraExpenseMinor = add(
          extraExpenseMinor,
          entry.amountMinor,
          "extraExpenseMinor",
        );
        itemPeriodExpense = safeAddMinor(
          itemPeriodExpense,
          entry.amountMinor,
          "物品期间支出",
        );
        addBucketValue(
          bucketMap,
          entry.occurredOn,
          yearlyBuckets,
          spanMonths,
          "extraExpenseMinor",
          entry.amountMinor,
          add,
        );

        // 期间额外支出分类统计
        const meta = EXPENSE_META[entry.kind];
        const expense = expenseMap.get(entry.kind) ?? {
          key: entry.kind,
          label: meta.label,
          icon: meta.icon,
          color: meta.color,
          amountMinor: 0,
          count: 0,
        };
        expense.amountMinor = add(
          expense.amountMinor,
          entry.amountMinor,
          `expenseKind:${entry.kind}`,
        );
        expense.count++;
        expenseMap.set(entry.kind, expense);
      } else {
        incomeEntryMinor = add(
          incomeEntryMinor,
          entry.amountMinor,
          "incomeEntryMinor",
        );
        addBucketValue(
          bucketMap,
          entry.occurredOn,
          yearlyBuckets,
          spanMonths,
          "incomeEntryMinor",
          entry.amountMinor,
          add,
        );
      }
    }

    // 期间结束持有件数与出售回收统计
    if (exit && isInRange(exit.exitedOn, range)) {
      if (
        exit.recoveryAmountMinor !== null &&
        exit.recoveryAmountMinor !== undefined
      ) {
        recoveryMinor = add(
          recoveryMinor,
          exit.recoveryAmountMinor,
          "recoveryMinor",
        );
        addBucketValue(
          bucketMap,
          exit.exitedOn,
          yearlyBuckets,
          spanMonths,
          "recoveryMinor",
          exit.recoveryAmountMinor,
          add,
        );
      }
    }

    // 期间分类投入统计（如果该物品在期间内有投入）
    if (itemPeriodExpense > 0) {
      const categoryKey = item.categoryId ?? "__uncategorized__";
      const category =
        categoryMap.get(categoryKey) ?? categoryTemplate(analysis.category);
      category.itemCount++;
      category.knownExpenseMinor = add(
        category.knownExpenseMinor,
        itemPeriodExpense,
        `category:${categoryKey}:knownExpenseMinor`,
      );
      categoryMap.set(categoryKey, category);
    }
  }

  fillCashFlowBuckets(bucketMap, range, yearlyBuckets, sortedYearsAsc);

  const periodExpenseMinor = add(
    acquisitionMinor,
    extraExpenseMinor,
    "totalExpenseMinor",
  );
  const periodIncomeMinor = add(
    incomeEntryMinor,
    recoveryMinor,
    "totalIncomeMinor",
  );
  const cashFlow: StatisticsCashFlow = {
    buckets: [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    expenseMinor: periodExpenseMinor,
    incomeMinor: periodIncomeMinor,
    netMinor: subtract(
      periodIncomeMinor,
      periodExpenseMinor,
      "cashFlow.netMinor",
    ),
    acquisitionMinor,
    extraExpenseMinor,
    incomeEntryMinor,
    recoveryMinor,
  };

  const totalItemCount = analyses.length;
  const activeCount =
    statusMap.get("in_use")!.count +
    statusMap.get("idle")!.count +
    statusMap.get("damaged")!.count;
  const endedCount =
    statusMap.get("sold")!.count +
    statusMap.get("gifted")!.count +
    statusMap.get("discarded")!.count +
    statusMap.get("lost")!.count;
  const categoriesResult = [...categoryMap.values()].sort((a, b) => {
    if (b.knownExpenseMinor !== a.knownExpenseMinor)
      return (b.knownExpenseMinor ?? -1) - (a.knownExpenseMinor ?? -1);
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
    return a.name.localeCompare(b.name, "zh-CN");
  });
  const expenseKinds = [...expenseMap.values()].sort(
    (a, b) => (b.amountMinor ?? -1) - (a.amountMinor ?? -1),
  );
  const buildRankingItem = async (
    analysis: ItemAnalysis,
    amountMinor: number,
    customDays?: number,
  ): Promise<StatisticsRankingItem> => {
    const cover = await resolveCoverPath(analysis.item.coverAssetId);
    const status = statusFor(analysis.item, analysis.exit);
    return {
      itemId: analysis.item.id,
      name: analysis.item.name,
      iconSymbol:
        analysis.item.iconSymbol ??
        analysis.category?.icon ??
        "shippingbox.fill",
      coverPath: cover.path,
      purchaseAmountMinor: analysis.item.acquisitionAmountMinor,
      status,
      amountMinor,
      holdingDays: customDays ?? analysis.summary.holdingDays,
    };
  };
  // 投入排行榜：如果选具体年份，则按该年度内的实际投入排行；如果选全部，则按历史总投入排行
  type PeriodAmountState = {
    relevant: boolean;
    expenseAvailable: boolean;
    netAvailable: boolean;
  };
  function periodAmountState(analysis: ItemAnalysis): PeriodAmountState {
    if (period === "all") {
      const expenseAvailable =
        analysis.summary.available && analysis.summary.isAcquisitionPriceKnown;
      return {
        relevant: true,
        expenseAvailable,
        netAvailable: expenseAvailable && analysis.summary.isExitPriceKnown,
      };
    }
    const acquiredInPeriod = isInRange(analysis.item.acquiredOn, range);
    const moneyInPeriod = analysis.money.some((entry) =>
      isInRange(entry.occurredOn, range),
    );
    const exitInPeriod =
      analysis.exit !== null && isInRange(analysis.exit.exitedOn, range);
    const relevant = acquiredInPeriod || moneyInPeriod || exitInPeriod;
    if (!relevant)
      return { relevant: false, expenseAvailable: true, netAvailable: true };
    const expenseAvailable = analysis.summary.available && !(
      acquiredInPeriod && analysis.item.acquisitionAmountMinor === null
    );
    const netAvailable =
      expenseAvailable &&
      !(
        exitInPeriod &&
        analysis.exit?.reason === "sold" &&
        analysis.exit.recoveryAmountMinor === null
      );
    return { relevant: true, expenseAvailable, netAvailable };
  }
  const periodAmountStates = new Map(
    analyses.map((analysis) => [analysis.item.id, periodAmountState(analysis)]),
  );
  const amountRelevantCount = [...periodAmountStates.values()].filter(
    (state) => state.relevant,
  ).length;
  const knownAmountCount = [...periodAmountStates.values()].filter(
    (state) => state.relevant && state.netAvailable,
  ).length;
  const periodUnavailableAmountCount = amountRelevantCount - knownAmountCount;

  type ItemExpenseRanking = { analysis: ItemAnalysis; amountMinor: number };
  const rankingList: ItemExpenseRanking[] = [];
  for (const analysis of analyses) {
    const amountState = periodAmountStates.get(analysis.item.id)!;
    if (!amountState.expenseAvailable) continue;
    let rankAmount = 0;
    if (period === "all") {
      rankAmount = analysis.summary.totalExpenseMinor;
    } else {
      if (
        analysis.item.acquisitionAmountMinor !== null &&
        isInRange(analysis.item.acquiredOn, range)
      ) {
        rankAmount = safeAddMinor(
          rankAmount,
          analysis.item.acquisitionAmountMinor,
          "排行购入",
        );
      }
      for (const entry of analysis.money) {
        if (
          entry.direction === "expense" &&
          isInRange(entry.occurredOn, range)
        ) {
          rankAmount = safeAddMinor(rankAmount, entry.amountMinor, "排行支出");
        }
      }
    }
    if (rankAmount > 0) {
      rankingList.push({ analysis, amountMinor: rankAmount });
    }
  }
  rankingList.sort((a, b) => b.amountMinor - a.amountMinor);

  const topExpense = await Promise.all(
    rankingList
      .slice(0, 10)
      .map((item) => buildRankingItem(item.analysis, item.amountMinor)),
  );
  const bottomExpense = await Promise.all(
    [...rankingList]
      .reverse()
      .slice(0, 10)
      .map((item) => buildRankingItem(item.analysis, item.amountMinor)),
  );
  // 每日成本排行榜：
  // 全部时间：按全生命周期每日成本排行
  // 具体年份：按该年度内单件物品产生的实际净成本 / 物品在当年的在持天数 排行
  type ItemDailyRanking = {
    analysis: ItemAnalysis;
    dailyCostMinor: number;
    days: number;
  };
  const dailyRankingList: ItemDailyRanking[] = [];
  for (const analysis of analyses) {
    const amountState = periodAmountStates.get(analysis.item.id)!;
    if (!analysis.summary.available || !amountState.netAvailable || analysis.summary.holdingDays === null) continue;
    if (period === "all") {
      if (!analysis.exit) {
        dailyRankingList.push({
          analysis,
          dailyCostMinor: analysis.summary.dailyCostMinor,
          days: analysis.summary.holdingDays,
        });
      }
    } else {
      const days = holdingDaysInRange(
        analysis.item.acquiredOn,
        analysis.exit?.exitedOn,
        range,
      );
      if (days > 0) {
        let itemYearExpense = 0;
        let itemYearIncome = 0;
        if (
          isInRange(analysis.item.acquiredOn, range) &&
          analysis.item.acquisitionAmountMinor !== null
        ) {
          itemYearExpense = safeAddMinor(
            itemYearExpense,
            analysis.item.acquisitionAmountMinor,
            "年度物品购入",
          );
        }
        for (const entry of analysis.money) {
          if (isInRange(entry.occurredOn, range)) {
            if (entry.direction === "expense") {
              itemYearExpense = safeAddMinor(
                itemYearExpense,
                entry.amountMinor,
                "年度物品支出",
              );
            } else {
              itemYearIncome = safeAddMinor(
                itemYearIncome,
                entry.amountMinor,
                "年度物品收入",
              );
            }
          }
        }
        if (
          analysis.exit &&
          isInRange(analysis.exit.exitedOn, range) &&
          analysis.exit.recoveryAmountMinor !== null &&
          analysis.exit.recoveryAmountMinor !== undefined
        ) {
          itemYearIncome = safeAddMinor(
            itemYearIncome,
            analysis.exit.recoveryAmountMinor,
            "年度物品回收",
          );
        }
        const itemYearNet = safeSubtractMinor(
          itemYearExpense,
          itemYearIncome,
          "年度物品净成本",
        );
        const dailyCostMinor = Math.round(itemYearNet / days);
        dailyRankingList.push({
          analysis,
          dailyCostMinor,
          days,
        });
      }
    }
  }
  dailyRankingList.sort((a, b) => b.dailyCostMinor - a.dailyCostMinor);

  const topDailyCost = await Promise.all(
    dailyRankingList
      .slice(0, 10)
      .map((item) =>
        buildRankingItem(item.analysis, item.dailyCostMinor, item.days),
      ),
  );
  const bottomDailyCost = await Promise.all(
    [...dailyRankingList]
      .reverse()
      .slice(0, 10)
      .map((item) =>
        buildRankingItem(item.analysis, item.dailyCostMinor, item.days),
      ),
  );

  // 陪伴时间排行榜：全部时间按每件物品的完整陪伴天数；年度按当年实际在持天数。
  type ItemHoldingRanking = { analysis: ItemAnalysis; days: number };
  const holdingRankingList: ItemHoldingRanking[] = [];
  for (const analysis of analyses) {
    if (analysis.summary.holdingDays === null) continue;
    if (period === "all") {
      holdingRankingList.push({ analysis, days: analysis.summary.holdingDays });
    } else {
      const days = holdingDaysInRange(
        analysis.item.acquiredOn,
        analysis.exit?.exitedOn,
        range,
      );
      if (days > 0) holdingRankingList.push({ analysis, days });
    }
  }
  holdingRankingList.sort(
    (a, b) =>
      b.days - a.days ||
      a.analysis.item.name.localeCompare(b.analysis.item.name, "zh-CN"),
  );

  const topHoldingTime = await Promise.all(
    holdingRankingList
      .slice(0, 10)
      .map((item) => buildRankingItem(item.analysis, 0, item.days)),
  );
  const bottomHoldingTime = await Promise.all(
    [...holdingRankingList]
      .sort(
        (a, b) =>
          a.days - b.days ||
          a.analysis.item.name.localeCompare(b.analysis.item.name, "zh-CN"),
      )
      .slice(0, 10)
      .map((item) => buildRankingItem(item.analysis, 0, item.days)),
  );

  const expiringSoonDate = addDays(today, 30);
  const alerts: StatisticsAlerts = {
    warrantyExpired: analyses.filter(
      (analysis) =>
        !analysis.exit &&
        analysis.item.warrantyUntil !== null &&
        analysis.item.warrantyUntil < today,
    ).length,
    warrantyExpiringSoon: analyses.filter(
      (analysis) =>
        !analysis.exit &&
        analysis.item.warrantyUntil !== null &&
        analysis.item.warrantyUntil >= today &&
        analysis.item.warrantyUntil <= expiringSoonDate,
    ).length,
    idleCount: statusMap.get("idle")!.count,
    damagedCount: statusMap.get("damaged")!.count,
    unknownAcquisitionCount: analyses.filter(
      (analysis) => analysis.item.acquisitionAmountMinor === null,
    ).length,
    missingValuationCount: analyses.filter(
      (analysis) => !analysis.exit && analysis.item.valuationMinor === null,
    ).length,
    missingSoldRecoveryCount: analyses.filter(
      (analysis) =>
        analysis.exit?.reason === "sold" &&
        analysis.exit.recoveryAmountMinor === null,
    ).length,
    uncategorizedCount: analyses.filter(
      (analysis) => analysis.item.categoryId === null,
    ).length,
  };

  // 状态分布：如果选具体年份，统计该年度购入物品的目前状态去向；如果全部时间，统计全量在持状态
  const activeStatusCounts = emptyStatusCounts();
  const activeStatusMap = new Map(
    activeStatusCounts.map((entry) => [entry.key, entry]),
  );
  for (const analysis of analyses) {
    if (period !== "all" && (!isValidYmd(analysis.item.acquiredOn) || analysis.item.acquiredOn > today || !isInRange(analysis.item.acquiredOn, range)))
      continue;
    const status = activeStatusMap.get(statusFor(analysis.item, analysis.exit));
    if (status) status.count++;
  }

  // 期间日均花销 (期间总支出 / 期间在账天数)
  const periodDays = range.from
    ? calendarHoldingDays(range.from, range.to)
    : calendarHoldingDays(firstEvent, range.to);
  const periodDailyExpenseMinor = periodExpenseMinor === null
    ? null : Math.round(periodExpenseMinor / periodDays);
  if (periodDailyExpenseMinor === null) overflow.add("periodDailyExpenseMinor");
  const netCostMinor = subtract(periodExpenseMinor, periodIncomeMinor, "netCostMinor");

  return {
    overflowMetrics: [...overflow].sort(),
    range,
    availableYears,
    snapshot: {
      amountStatus: periodExpenseMinor === null || periodIncomeMinor === null || netCostMinor === null
        ? "unavailable" : periodUnavailableAmountCount > 0 ? "partial" : "valid",
      totalItemCount,
      activeCount,
      endedCount,
      addedCount,
      endedCountInPeriod,
      totalExpenseMinor: periodExpenseMinor,
      totalIncomeMinor: periodIncomeMinor,
      netCostMinor,
      currentExpenseMinor,
      currentDailyCostMinor,
      periodDailyExpenseMinor,
      currentValuationMinor,
      valuationCount,
      valuationTotalCount: activeCount,
      valuationComparableGapMinor,
      valuationComparableCount,
      knownAmountCount,
      amountRelevantCount,
      unavailableAmountCount: periodUnavailableAmountCount,
    },
    statuses: activeStatusCounts,
    categories: categoriesResult,
    expenseKinds,
    cashFlow,
    lifecycle: {
      averageCurrentHoldingDays: activeHoldingCount > 0 ? averageRounded(activeHoldingDays, activeHoldingCount) : null,
      longestCurrentHoldingDays: activeHoldingCount > 0 ? longestCurrentHoldingDays : null,
      knownHoldingCount: activeHoldingCount,
      unavailableHoldingCount: analyses.filter((analysis) => !analysis.exit && analysis.summary.holdingDays === null).length,
      holdingBuckets,
    },
    rankings: {
      topExpense,
      bottomExpense,
      topDailyCost,
      bottomDailyCost,
      topHoldingTime,
      bottomHoldingTime,
    },
    alerts,
  };
}
