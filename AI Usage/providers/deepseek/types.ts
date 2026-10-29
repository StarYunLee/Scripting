import type { UsageBalanceView } from "../../models";

/**
 * DeepSeek 公开余额接口（GET /user/balance）是账户级数据：
 * 同一账户下的多个 API Key 读到同一份余额，不存在 per-key 独立钱包，
 * 展示层不得把多个 Key 的余额相加，也不据此拆分额度。
 */
export type DeepseekAccountProfile = {
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
  accounts: DeepseekAccountProfile[];
};

/** 余额窗口只承载金额与币种，不生成百分比、重置时间或额度上限。 */
export type DeepseekBalanceWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  kind: "balance";
  balance: UsageBalanceView;
};

export type UsageSnapshot = {
  windows: DeepseekBalanceWindow[];
  planLabel: string | null;
  fetchedAt: string;
  source: "live" | "cache";
};

export type UsageErrorCode =
  | "missing_token"
  | "unauthorized"
  | "rate_limited"
  | "http_error"
  | "network_error"
  | "invalid_response"
  | "account_changed"
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

/** 授权阶段用候选 Key 调官方余额接口做验证；零余额同样是成功。 */
export type VerifyKeyResult =
  | { ok: true; balances: UsageBalanceView[] }
  | {
      ok: false;
      code: UsageErrorCode;
      message: string;
      status?: number;
    };
