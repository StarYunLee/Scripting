import type { UsageWindowKind } from "../../models";

export type WorkbuddyRegion = "cn" | "intl";

export type WorkbuddyAccountProfile = {
  id: string;
  name: string;
  email: string | null;
  accountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountRegistry = {
  version: 1;
  defaultAccountId: string | null;
  accounts: WorkbuddyAccountProfile[];
};

export type WorkbuddyWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  kind: UsageWindowKind;
  detail: string | null;
};

export type UsageSnapshot = {
  windows: WorkbuddyWindow[];
  planLabel: string | null;
  region: WorkbuddyRegion;
  fetchedAt: string;
  source: "live" | "cache";
};

export type UsageErrorCode =
  | "missing_token"
  | "unauthorized"
  | "http_error"
  | "network_error"
  | "invalid_json"
  | "restricted"
  | "unknown";

export type UsageResult =
  | { ok: true; snapshot: UsageSnapshot; storageAccepted?: boolean }
  | {
      ok: false;
      error: {
        code: UsageErrorCode;
        message: string;
        status?: number;
        detail?: string;
      };
      cache?: UsageSnapshot | null;
    };

export type WidgetSettings = Record<string, never>;

export type WorkbuddySummaryPackage = {
  code: string;
  name: string | null;
  /**
   * CycleTotalCapacity 字段是否出现（空串视为未出现）。
   * 字段出现即为“有总额”的包，值可以是真实的 0；“0 总额”不是预付费余额。
   * total 为 null 表示字段存在但数值非法（负数/非数），调用方应拒绝该包。
   */
  hasTotal: boolean;
  total: number | null;
  used: number | null;
  remain: number | null;
  unit: string | null;
};

export type WorkbuddySummary = {
  isPaidUser: boolean;
  subscriptionCode: string | null;
  subscriptionName: string | null;
  packages: WorkbuddySummaryPackage[];
  totalCredits: number | null;
};

export type WorkbuddyPackageDetail = {
  code: string;
  name: string | null;
  capacityType: string | null;
  cycleStart: number;
  cycleEnd: number;
  deductionEnd: number;
  expiredAt: number;
  size: number | null;
  remain: number | null;
  used: number | null;
  status: number | null;
};

export type WorkbuddyEnterpriseUsage = {
  used: number;
  limit: number;
  cycleStart: number;
  cycleReset: number;
};

export type WorkbuddyCheckinStatus = {
  /** 签到活动是否开放；false 是接口的明确回答，不等于读取失败 */
  active: boolean;
  checkedIn: boolean;
  streakDays: number;
  /** null 表示接口未给该字段（与真实奖励 0 区分） */
  dailyCredit: number | null;
  /** null 表示接口未给该字段（与真实奖励 0 区分） */
  todayCredit: number | null;
  resetAt: string;
};
