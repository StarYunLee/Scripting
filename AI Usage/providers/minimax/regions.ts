import type { MinimaxRegion } from "./types";

const CONSOLE_URLS: Record<MinimaxRegion, string> = {
  intl: "https://platform.minimax.io/user-center/payment/token-plan",
  cn: "https://platform.minimaxi.com/user-center/payment/token-plan",
};

const QUOTA_URLS: Record<MinimaxRegion, string[]> = {
  intl: [
    "https://api.minimax.io/v1/token_plan/remains",
    "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
    "https://www.minimax.io/v1/token_plan/remains",
    "https://www.minimax.io/v1/api/openplatform/coding_plan/remains",
  ],
  cn: [
    "https://api.minimaxi.com/v1/token_plan/remains",
    "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains",
    "https://www.minimaxi.com/v1/token_plan/remains",
    "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
  ],
};

/** Subscription Key 可查询的套餐信息（控制台 remains_percent 接受 API Key）。 */
const PLAN_INFO_URLS: Record<MinimaxRegion, string[]> = {
  intl: [
    "https://api.minimax.io/backend/account/token_plan/remains_percent",
    "https://www.minimax.io/backend/account/token_plan/remains_percent",
    "https://platform.minimax.io/backend/account/token_plan/remains_percent",
  ],
  cn: [
    "https://api.minimaxi.com/backend/account/token_plan/remains_percent",
    "https://www.minimaxi.com/backend/account/token_plan/remains_percent",
    "https://platform.minimaxi.com/backend/account/token_plan/remains_percent",
  ],
};

/** 用户信息：Subscription Key / 会话均可尝试；拿不到时由调用方兜底。 */
const USER_INFO_URLS: Record<MinimaxRegion, string[]> = {
  intl: [
    "https://www.minimax.io/v1/api/user/info",
    "https://api.minimax.io/v1/api/user/info",
    "https://www.minimax.io/backend/user/biz_info",
    "https://platform.minimax.io/backend/user/biz_info",
    "https://api.minimax.io/backend/user/biz_info",
  ],
  cn: [
    "https://www.minimaxi.com/v1/api/user/info",
    "https://api.minimaxi.com/v1/api/user/info",
    "https://www.minimaxi.com/backend/user/biz_info",
    "https://platform.minimaxi.com/backend/user/biz_info",
    "https://api.minimaxi.com/backend/user/biz_info",
  ],
};

export function consoleUrlForRegion(region: MinimaxRegion): string {
  return CONSOLE_URLS[region];
}

export function quotaUrls(region: MinimaxRegion): string[] {
  return [...QUOTA_URLS[region]];
}

export function planInfoUrls(region: MinimaxRegion): string[] {
  return [...PLAN_INFO_URLS[region]];
}

export function userInfoUrls(region: MinimaxRegion): string[] {
  return [...USER_INFO_URLS[region]];
}

export function regionProbeOrder(
  preferred: MinimaxRegion | null | undefined,
): MinimaxRegion[] {
  return preferred === "cn" ? ["cn", "intl"] : ["intl", "cn"];
}
