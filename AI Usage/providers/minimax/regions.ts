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

export function consoleUrlForRegion(region: MinimaxRegion): string {
  return CONSOLE_URLS[region];
}

export function quotaUrls(region: MinimaxRegion): string[] {
  return [...QUOTA_URLS[region]];
}

export function regionProbeOrder(
  preferred: MinimaxRegion | null | undefined,
): MinimaxRegion[] {
  return preferred === "cn" ? ["cn", "intl"] : ["intl", "cn"];
}
