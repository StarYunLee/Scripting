import {
  balanceDetail,
  creditDetail,
  formatCredits,
  formatShortDate,
  todayEndIso,
  parseBeijingTime,
} from "./format";
import type {
  WorkbuddyCheckinStatus,
  WorkbuddyEnterpriseUsage,
  WorkbuddyPackageDetail,
  WorkbuddySummary,
  WorkbuddySummaryPackage,
  WorkbuddyWindow,
} from "./types";

const DAILY_CODE = "TCACA_code_001_PqouKr6QWV";
const DAILY_CAPACITY_TYPE = "4";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
}

/** 额度类数值：拒绝负数与非数，避免把脏数据算成余额/总量。 */
function capacity(value: unknown): number | null {
  const number = toNumber(value);
  return number != null && number >= 0 ? number : null;
}

/** 字段是否真的出现：null/undefined/空串视为没有该字段（与上游一致）。 */
function filled(value: unknown): boolean {
  if (value == null) return false;
  return !(typeof value === "string" && value === "");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isoFrom(ms: number): string | null {
  return ms > 0 ? new Date(ms).toISOString() : null;
}

export function parseSummary(payload: unknown): WorkbuddySummary {
  const data = asObject(payload) || {};
  const packages: WorkbuddySummaryPackage[] = [];
  if (Array.isArray(data.Packages)) {
    for (const value of data.Packages) {
      const row = asObject(value);
      if (!row) continue;
      const code = firstString(row.PackageCode);
      if (!code) continue;
      packages.push({
        code,
        name: firstString(row.PackageName),
        // 与 WorkBuddy 一致：CycleTotalCapacity 出现即按“有总额”处理，
        // 0 也是总额；只有字段缺失/空串才是无总额的预付费包。
        hasTotal: filled(row.CycleTotalCapacity),
        total: capacity(row.CycleTotalCapacity),
        used: capacity(row.CycleUsedCapacity),
        remain: capacity(row.CycleRemainCapacity),
        unit: firstString(row.CapacityUnit),
      });
    }
  }
  return {
    isPaidUser: data.IsPaidUser === true,
    subscriptionCode: firstString(data.SubscriptionPackageCode),
    subscriptionName: firstString(data.SubscriptionPackageName),
    packages,
    totalCredits: toNumber(data.TotalCredits),
  };
}

export function parsePackages(payload: unknown): WorkbuddyPackageDetail[] {
  const data = asObject(payload);
  const accounts = Array.isArray(data?.Accounts) ? data.Accounts : [];
  const out: WorkbuddyPackageDetail[] = [];
  for (const value of accounts) {
    const row = asObject(value);
    if (!row) continue;
    const code = firstString(row.PackageCode);
    if (!code) continue;
    const cycleEnd = parseBeijingTime(row.CycleEndTime);
    const expiredAt = parseBeijingTime(row.ExpiredTime);
    out.push({
      code,
      name: firstString(row.PackageName),
      capacityType:
        row.CapacityType == null ? null : String(row.CapacityType),
      cycleStart: parseBeijingTime(row.CycleStartTime),
      cycleEnd,
      deductionEnd:
        parseBeijingTime(row.DeductionEndTime) || expiredAt || cycleEnd,
      expiredAt,
      size:
        capacity(row.CycleCapacitySizePrecise) ??
        capacity(row.CycleCapacitySize) ??
        capacity(row.CapacitySize),
      remain:
        capacity(row.CycleCapacityRemainPrecise) ??
        capacity(row.CycleCapacityRemain),
      used:
        capacity(row.CycleCapacityUsedPrecise) ??
        capacity(row.CycleCapacityUsed),
      status: toNumber(row.Status),
    });
  }
  return out;
}

export function parseEnterprise(payload: unknown): WorkbuddyEnterpriseUsage | null {
  const data = asObject(payload);
  if (!data) return null;
  const limit = capacity(data.limitNum);
  const used = capacity(data.credit);
  if (limit == null || limit <= 0 || used == null) return null;
  return {
    used,
    limit,
    cycleStart: parseBeijingTime(data.cycleStartTime),
    cycleReset: parseBeijingTime(data.cycleResetTime),
  };
}

export function parseCheckin(payload: unknown): WorkbuddyCheckinStatus | null {
  const data = asObject(payload);
  if (!data) return null;
  // active 是“签到活动是否开放”的明确回答，必须存在且为布尔值；
  // 缺失/非法 shape 不能当成 active:false，也不能当成未签到。
  if (typeof data.active !== "boolean") return null;
  // 开放状态下没有签到与否的布尔值，就无法判断今天签没签；按读取失败处理。
  if (data.active && typeof data.today_checked_in !== "boolean") return null;
  return {
    active: data.active,
    checkedIn: data.today_checked_in === true,
    streakDays: Math.max(0, Math.floor(capacity(data.streak_days) ?? 0)),
    // 0 是真实奖励，缺失是 null：不能用 0 回退，也不能用默认值补 100。
    dailyCredit: capacity(data.daily_credit),
    todayCredit: capacity(data.today_credit),
    resetAt: todayEndIso(),
  };
}

/**
 * 摘要包的额度划分，供窗口构建与 API 层共用：
 * - hasTotal 的包计入分母（0 也是分母，不进入预付费）；
 * - 没有 total 字段的包才是预付费余额；
 * - 日切片（daily free）不进入预付费余额，避免它和到期日的口径不一致；
 * - 负数和非法数值被拒绝（total 字段存在但 total 为 null 的包整包跳过）。
 */
export function summaryCapacity(
  summary: WorkbuddySummary,
  details: WorkbuddyPackageDetail[] = [],
): {
  total: number;
  used: number;
  prepaid: number;
  prepaidCodes: string[];
} {
  let total = 0;
  let used = 0;
  let prepaid = 0;
  const prepaidCodes: string[] = [];
  const sliceCodes = new Set(
    details.filter((detail) => detail.capacityType === DAILY_CAPACITY_TYPE)
      .map((detail) => detail.code),
  );
  for (const pack of summary.packages) {
    if (pack.hasTotal) {
      if (pack.total == null) continue;
      total += pack.total;
      used += pack.used ?? 0;
      continue;
    }
    if (pack.code === DAILY_CODE || sliceCodes.has(pack.code)) continue;
    if (pack.remain == null) continue;
    prepaid += pack.remain;
    prepaidCodes.push(pack.code);
  }
  return { total, used, prepaid, prepaidCodes };
}

export function checkinDetail(input: {
  checkin: WorkbuddyCheckinStatus | null;
  region: "cn" | "intl";
}): string {
  // 国际站没有签到活动：显式“未开放”。
  if (input.region !== "cn") return "签到未开放";
  const checkin = input.checkin;
  // 国内站 null 只代表读取失败（请求失败/空响应/非法 shape），不是“未开放”，
  // 更不是“未签到”。
  if (!checkin) return "签到状态获取失败";
  if (!checkin.active) return "签到未开放";
  // 已签只看实际已领字段，未签只看可领字段；缺失不等于 0，也不能相互代替。
  const credit = checkin.checkedIn ? checkin.todayCredit : checkin.dailyCredit;
  const amount = credit == null ? "" : ` +${formatCredits(credit)} 积分`;
  if (checkin.checkedIn) {
    return `已签${amount}${checkin.streakDays > 0 ? ` · 连续 ${checkin.streakDays} 天` : ""}`;
  }
  return `可签${amount}`;
}

function cycleReset(
  summary: WorkbuddySummary,
  details: WorkbuddyPackageDetail[],
  now: number,
): string | null {
  if (summary.subscriptionCode) {
    const found = details.find(
      (detail) =>
        detail.code === summary.subscriptionCode && detail.cycleEnd > now,
    );
    return found ? isoFrom(found.cycleEnd) : null;
  }
  const slice = details.find(
    (detail) =>
      detail.capacityType === DAILY_CAPACITY_TYPE && detail.cycleEnd > now,
  );
  return slice ? isoFrom(slice.cycleEnd) : null;
}

function runsOut(
  summary: WorkbuddySummary,
  details: WorkbuddyPackageDetail[],
  now: number,
): { at: number; amount: number } | null {
  const counted = new Set(summary.packages.map((pack) => pack.code));
  let at = 0;
  let amount = 0;
  for (const detail of details) {
    if (!counted.has(detail.code)) continue;
    if (detail.code === DAILY_CODE || detail.capacityType === DAILY_CAPACITY_TYPE)
      continue;
    const remain = detail.remain ?? 0;
    const end = detail.deductionEnd || detail.expiredAt || detail.cycleEnd;
    if (remain <= 0 || end <= now) continue;
    if (at === 0 || end < at) {
      at = end;
      amount = remain;
    } else if (end === at) {
      amount += remain;
    }
  }
  return at > 0 ? { at, amount } : null;
}


export function buildWindows(input: {
  summary: WorkbuddySummary;
  paid: WorkbuddyPackageDetail[];
  free: WorkbuddyPackageDetail[];
  enterprise: WorkbuddyEnterpriseUsage | null;
  checkin: WorkbuddyCheckinStatus | null;
  region: "cn" | "intl";
  now?: number;
}): { windows: WorkbuddyWindow[]; planLabel: string } {
  const now = input.now ?? Date.now();
  const details = [...input.paid, ...input.free];
  const windows: WorkbuddyWindow[] = [];
  // 余额与最早到期都从同一份包划分得出（summaryCapacity），不再各算一套。
  const { total, used, prepaid, prepaidCodes } = summaryCapacity(input.summary, details);
  const prepaidSet = new Set(prepaidCodes);

  if (total > 0) {
    const usedPercent = clamp((100 * used) / total);
    windows.push({
      id: "workbuddy:credits",
      label: "套餐积分",
      usedPercent,
      remainingPercent: clamp(100 - usedPercent),
      resetAt: cycleReset(input.summary, details, now),
      kind: "quota",
      detail: creditDetail(used, total),
    });
  }

  windows.push({
    id: "workbuddy:checkin",
    label: "今日签到",
    usedPercent: null,
    remainingPercent: null,
    resetAt: input.region === "cn" ? todayEndIso(now) : null,
    kind: "status",
    detail: checkinDetail({ checkin: input.checkin, region: input.region }),
  });

  if (prepaidCodes.length > 0 && (total <= 0 || prepaid > 0)) {
    // 同一包集合：余额来自摘要里的无 total 包，最早到期只在这些包的明细里找。
    const earliest = details
      .filter((detail) => prepaidSet.has(detail.code))
      .map((detail) => detail.deductionEnd || detail.expiredAt || detail.cycleEnd)
      .filter((value) => value > now)
      .sort((left, right) => left - right)[0];
    windows.push({
      id: "workbuddy:prepaid",
      label: "预付费积分",
      usedPercent: null,
      remainingPercent: null,
      resetAt: isoFrom(earliest || 0),
      kind: "balance",
      detail: balanceDetail(prepaid),
    });
  }

  const expiring = runsOut(input.summary, details, now);
  const creditsReset = windows.find((w) => w.id === "workbuddy:credits")?.resetAt;
  if (expiring) {
    const resetMs = creditsReset ? Date.parse(creditsReset) : 0;
    if (!resetMs || expiring.at < resetMs) {
      windows.push({
        id: "workbuddy:expiring",
        label: "即将到期",
        usedPercent: null,
        remainingPercent: null,
        resetAt: isoFrom(expiring.at),
        kind: "notice",
        detail: `${formatCredits(expiring.amount)} 积分 · ${formatShortDate(isoFrom(expiring.at))} 到期`,
      });
    }
  }

  if (input.enterprise && total <= 0) {
    const enterprise = input.enterprise;
    const usedPercent = clamp((100 * enterprise.used) / enterprise.limit);
    windows.unshift({
      id: "workbuddy:credits",
      label: "企业积分",
      usedPercent,
      remainingPercent: clamp(100 - usedPercent),
      resetAt: isoFrom(enterprise.cycleReset),
      kind: "quota",
      detail: creditDetail(enterprise.used, enterprise.limit),
    });
  }

  return {
    windows,
    planLabel: input.region === "cn" ? "国内版" : "国际版",
  };
}
